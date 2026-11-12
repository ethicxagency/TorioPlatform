import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { isBlockedAddress, parsePublicUrl, UnsafeUrlError } from './url-guard';

export const USER_AGENT = 'TorioBot/1.0 (+https://torio.nextupglobal.net)';

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  /** True when the page was cut at the size limit. */
  truncated: boolean;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Content types worth reading; anything else is rejected without downloading the body. */
  accept?: RegExp;
}

/**
 * DNS lookup that refuses to connect to anything non-public. It runs at connection time, on the address actually used, so a
 * name that resolves to a private address (or is rebound to one after being checked) is stopped.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4);
    const list = Array.isArray(addresses) ? addresses : [];
    if (!list.length || list.some((a) => isBlockedAddress(a.address)))
      return callback(new UnsafeUrlError('That address resolves to an internal network.'), '', 4);
    if ((options as { all?: boolean }).all)
      return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
};

const sameSite = (a: URL, b: URL) =>
  a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');

function once(url: URL, o: Required<FetchOptions>): Promise<FetchResult & { location?: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup,
        timeout: o.timeoutMs,
        headers: {
          'user-agent': USER_AGENT,
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.1',
          'accept-encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({
            url: url.toString(),
            status,
            contentType: type,
            body: '',
            truncated: false,
            location: String(res.headers.location),
          });
        }
        if (!o.accept.test(type) && status < 400) {
          res.resume();
          return reject(new Error(`Not a web page (${type.split(';')[0] || 'unknown type'}).`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > o.maxBytes) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        const done = () => {
          let buf = Buffer.concat(chunks);
          try {
            const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
            if (enc === 'gzip') buf = gunzipSync(buf);
            else if (enc === 'deflate') buf = inflateSync(buf);
            else if (enc === 'br') buf = brotliDecompressSync(buf);
          } catch {
            // a cut-off compressed stream cannot be read; treat as an empty page
            buf = Buffer.alloc(0);
          }
          resolve({
            url: url.toString(),
            status,
            contentType: type,
            body: buf.subarray(0, o.maxBytes).toString('utf8'),
            truncated,
          });
        };
        res.on('end', done);
        res.on('close', () => truncated && done());
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('The site took too long to respond.')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * GET with the limits a crawler needs: a timeout, a size cap, a content-type filter, a few redirects (re-checked at every
 * hop, and only within the same site) and DNS-time address checks. Never used with a URL that skipped `parsePublicUrl`.
 */
export async function safeGet(raw: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const o: Required<FetchOptions> = {
    timeoutMs: opts.timeoutMs ?? 8000,
    maxBytes: opts.maxBytes ?? 1_000_000,
    maxRedirects: opts.maxRedirects ?? 4,
    accept: opts.accept ?? /text\/html|application\/xhtml|text\/plain|application\/xml|text\/xml/i,
  };
  const start = parsePublicUrl(raw);
  let url = start;
  for (let hop = 0; hop <= o.maxRedirects; hop++) {
    const r = await once(url, o);
    if (!r.location) return r;
    let next: URL;
    try {
      next = parsePublicUrl(new URL(r.location, url).toString());
    } catch (e) {
      throw e instanceof UnsafeUrlError
        ? e
        : new Error('The site redirected to an invalid address.');
    }
    if (!sameSite(start, next)) throw new Error('The site redirects to a different website.');
    url = next;
  }
  throw new Error('The site redirected too many times.');
}

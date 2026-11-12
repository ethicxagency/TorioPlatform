import { BlockList, isIP } from 'node:net';

export class UnsafeUrlError extends Error {}

/**
 * Addresses a public website crawl must never reach: loopback, private and link-local ranges (including the cloud metadata
 * address 169.254.169.254), carrier-grade NAT, documentation and benchmarking ranges, multicast and reserved space.
 */
const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(net, bits, 'ipv6');

/** True when `ip` is not a routable public address. IPv4-mapped IPv6 addresses are judged by their IPv4 part. */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 0) return true;
  if (v === 6) {
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (m) return isBlockedAddress(m[1]!);
    return blocked.check(ip, 'ipv6');
  }
  return blocked.check(ip, 'ipv4');
}

const BAD_SUFFIX = ['.local', '.localhost', '.internal', '.intranet', '.lan', '.home', '.corp'];

/**
 * Parses and checks a URL a person typed. Only http(s) on the default ports, no embedded credentials, no IP literals in
 * private space and no internal-looking hostnames. DNS is checked separately, at connection time, in `safe-fetch`.
 */
export function parsePublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError('That is not a valid web address.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:')
    throw new UnsafeUrlError('Only http and https addresses can be scanned.');
  if (u.username || u.password) throw new UnsafeUrlError('Addresses with a login are not allowed.');
  if (u.port && u.port !== (u.protocol === 'https:' ? '443' : '80'))
    throw new UnsafeUrlError('Only the standard web ports can be scanned.');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || BAD_SUFFIX.some((s) => host.endsWith(s)))
    throw new UnsafeUrlError('Internal addresses cannot be scanned.');
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new UnsafeUrlError('Internal addresses cannot be scanned.');
  } else if (!host.includes('.')) {
    throw new UnsafeUrlError('Enter a full website address, such as https://example.com.');
  }
  u.hash = '';
  return u;
}

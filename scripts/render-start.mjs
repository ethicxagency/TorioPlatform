// Render start for the unified Torio service: one public port, two internal apps.
//
//   /api/*, /socket.io/*  -> NestJS API   (127.0.0.1:API_INTERNAL_PORT)
//   everything else       -> Next.js web  (127.0.0.1:WEB_INTERNAL_PORT)
//
// Serving both from one domain keeps the refresh cookie first-party and lets the Inbox's
// WebSocket reach the API. Database migrations run first, so a deploy never starts on an old schema.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 10000;
const API_PORT = Number(process.env.API_INTERNAL_PORT) || 4001;
const WEB_PORT = Number(process.env.WEB_INTERNAL_PORT) || 3001;
const HOST = '127.0.0.1';

// Render provides the public URL; use it unless the operator set these explicitly.
const publicUrl = process.env.RENDER_EXTERNAL_URL;
const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'production',
  ...(publicUrl && {
    WEB_URL: process.env.WEB_URL ?? publicUrl,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS ?? publicUrl,
    COOKIE_SECURE: process.env.COOKIE_SECURE ?? 'true',
  }),
};

const log = (msg) => console.log(`[render-start] ${msg}`);

if (process.env.SKIP_MIGRATIONS !== 'true') {
  log('applying database migrations');
  const prisma = createRequire(resolve(root, 'package.json')).resolve('prisma/build/index.js');
  const r = spawnSync(process.execPath, [prisma, 'migrate', 'deploy'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    log('migrations failed; not starting');
    process.exit(r.status ?? 1);
  }
}

const nextBin = createRequire(resolve(root, 'apps/web/package.json')).resolve('next/dist/bin/next');
const children = [
  spawn(process.execPath, [resolve(root, 'apps/api/dist/main.js')], {
    cwd: resolve(root, 'apps/api'),
    env: { ...env, PORT: String(API_PORT) },
    stdio: 'inherit',
  }),
  spawn(process.execPath, [nextBin, 'start', '-p', String(WEB_PORT), '-H', HOST], {
    cwd: resolve(root, 'apps/web'),
    env,
    stdio: 'inherit',
  }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 5000).unref();
}
// If either app dies, take the whole service down so Render restarts it cleanly.
for (const c of children)
  c.on('exit', (code) => {
    log(`child exited with ${code}; stopping`);
    stop(code ?? 1);
  });
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));

const targetPort = (url = '/') =>
  url.startsWith('/api/') || url === '/api' || url.startsWith('/socket.io/') ? API_PORT : WEB_PORT;

// Keep Render's X-Forwarded-For as is: the API trusts this loopback hop and reads the client from it.
const forwardHeaders = (req) => ({
  ...req.headers,
  'x-forwarded-for': req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '',
  'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? 'https',
  'x-forwarded-host': req.headers['x-forwarded-host'] ?? req.headers.host ?? '',
});

const server = http.createServer((req, res) => {
  const upstream = http.request(
    {
      host: HOST,
      port: targetPort(req.url),
      method: req.method,
      path: req.url,
      headers: forwardHeaders(req),
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Torio is starting up. Try again in a moment.');
  });
  req.pipe(upstream);
});

// WebSocket upgrades (Inbox live updates): pipe the raw sockets through.
server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(targetPort(req.url), HOST, () => {
    const headers = forwardHeaders(req);
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [k, v] of Object.entries(headers))
      for (const value of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${value}`);
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  const close = () => {
    upstream.destroy();
    socket.destroy();
  };
  upstream.on('error', close);
  socket.on('error', close);
});

server.listen(PORT, '0.0.0.0', () =>
  log(`listening on :${PORT} (api :${API_PORT}, web :${WEB_PORT})`),
);

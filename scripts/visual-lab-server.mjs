import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.VISUAL_LAB_HOST || '127.0.0.1';
const PORT = Number(process.env.VISUAL_LAB_PORT || 4173);
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const absolute = path.resolve(ROOT, relative);
  return absolute === ROOT || absolute.startsWith(`${ROOT}${path.sep}`) ? absolute : null;
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method Not Allowed');
    return;
  }

  const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
  const filePath = safePath(pathname);
  if (!filePath) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad Request');
    return;
  }

  const metadata = await stat(filePath).catch(() => null);
  if (!metadata?.isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
    return;
  }

  const headers = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    Expires: '0',
    Pragma: 'no-cache',
  };
  if (request.method === 'HEAD') {
    response.writeHead(200, headers);
    response.end();
    return;
  }

  const body = await readFile(filePath);
  response.writeHead(200, { ...headers, 'Content-Length': body.byteLength });
  response.end(body);
});

server.on('error', (error) => {
  console.error(`[US Visual Lab] server error: ${error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`[US Visual Lab] serving ${ROOT}`);
  console.log(`[US Visual Lab] http://localhost:${PORT}`);
  console.log('[US Visual Lab] local mode: append ?us-dev=1');
});

function shutdown(signal) {
  console.log(`[US Visual Lab] ${signal}; stopping`);
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

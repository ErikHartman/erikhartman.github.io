import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.PORT || 4321);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
try { await stat(path.join(root, 'index.html')); }
catch { console.error('Build the site first with npm run build.'); process.exit(1); }
const actualRoot = await realpath(root);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.bib': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
};
const withinRoot = file => file === actualRoot || file.startsWith(`${actualRoot}${path.sep}`);

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return;
  }
  let url, pathname;
  try {
    url = new URL(request.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0')) throw new Error('Invalid path');
  } catch { response.writeHead(400); response.end('Invalid request path'); return; }
  let file = path.resolve(actualRoot, `.${pathname}`);
  let status = 200;
  try {
    if (!withinRoot(file)) throw new Error('Outside site');
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) {
        response.writeHead(301, { Location: `${url.pathname}/${url.search}` }); response.end(); return;
      }
      file = path.join(file, 'index.html');
    }
    file = await realpath(file);
    if (!withinRoot(file) || !(await stat(file)).isFile()) throw new Error('Not a site file');
  } catch { file = path.join(actualRoot, '404.html'); status = 404; }
  try {
    const body = await readFile(file);
    response.writeHead(status, {
      'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : 'Page not found');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Set PORT to use another port.` : error.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => console.log(`Preview: http://localhost:${port} (Ctrl+C to stop)`));

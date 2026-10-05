import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.argv[2] ?? 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Usage: node start-demo.mjs [port]');
  process.exit(1);
}
try {
  await readFile(resolve(root, 'index.html'));
} catch {
  console.error('dist/index.html is missing. Run npm ci && npm run build first.');
  process.exit(1);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const filename = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!filename.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Port is in use. Try: node start-demo.mjs 4174' : error.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`TAKUMI demo: http://127.0.0.1:${server.address().port}`);
  console.log('Press Ctrl+C to stop.');
});

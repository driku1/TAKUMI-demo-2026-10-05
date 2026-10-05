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
let indexHtml;
try {
  indexHtml = await readFile(resolve(root, 'index.html'), 'utf8');
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
// What another server on the port is serving: this build, another build, or something else.
async function servedPage(candidate) {
  try {
    const response = await fetch(`http://127.0.0.1:${candidate}/`, { signal: AbortSignal.timeout(1500) });
    return await response.text();
  } catch {
    return null;
  }
}

let current = port;
server.on('error', async error => {
  if (error.code !== 'EADDRINUSE' || current - port >= 20) {
    console.error(error.message);
    process.exit(1);
  }
  const page = await servedPage(current);
  if (page === indexHtml) {
    console.log(`TAKUMI demo (this version) is already running: http://127.0.0.1:${current}`);
    process.exit(0);
  }
  console.warn(`Port ${current} is used by ${page?.includes('TAKUMI') ? 'another version of the TAKUMI demo' : 'another program'}.`);
  console.warn(`ポート${current}では${page?.includes('TAKUMI') ? '別のバージョンのTAKUMIデモ' : '別のプログラム'}が動いています。古い画面ではなく、下に表示するURLを開いてください。`);
  current += 1;
  server.listen(current, '127.0.0.1');
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`TAKUMI demo: ${url}`);
  if (current !== port) {
    console.log(`（ポートが変わったため、保存済みの知見は空の状態から始まります。古いデモはそのウィンドウでCtrl+Cを押すと止まります）`);
  }
  console.log('Press Ctrl+C to stop.');
});
server.listen(port, '127.0.0.1');

// Local demo server (Node.js standard library only).
//   node start-demo.mjs [port]            the demo as a static site
//   node start-demo.mjs --skills [port]   plus the runtime the Codex skills drive
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, sep } from 'node:path';

const appRoot = dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const args = process.argv.slice(2);
const skills = args.includes('--skills');
const port = Number(args.find((value) => !value.startsWith('--')) ?? 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Usage: node start-demo.mjs [--skills] [port]');
  process.exit(1);
}
let indexHtml;
try {
  indexHtml = await readFile(resolve(root, 'index.html'), 'utf8');
} catch {
  console.error('dist/index.html is missing. Run npm ci && npm run build first.');
  process.exit(1);
}
const store = skills ? await import('./scripts/runtime-store.mjs') : null;
if (store) await store.readState(appRoot);

// The skill runtime is handed to the page with the HTML, so the first render
// already shows the current step and the Merged knowledge.
const RUNTIME_SCRIPT = /<script>window\.__TAKUMI_SKILLS__=[\s\S]*?<\/script>/;
async function pageHtml() {
  if (!store) return indexHtml;
  const runtime = { state: await store.readState(appRoot), knowledge: await store.readKnowledge(appRoot) };
  const json = JSON.stringify(runtime).replace(/</g, '\\u003c');
  return indexHtml.replace('</head>', `<script>window.__TAKUMI_SKILLS__=${json}</script></head>`);
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const headers = (type) => ({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
const sendJson = (res, status, value) => res.writeHead(status, headers('application/json; charset=utf-8')).end(JSON.stringify(value));

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('too large');
  }
  return JSON.parse(body || '{}');
}

async function api(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/state') return sendJson(res, 200, await store.readState(appRoot));
  if (req.method === 'GET' && pathname === '/api/knowledge') return sendJson(res, 200, await store.readKnowledge(appRoot));
  // Merge happens on the screen, after a person's Approve review.
  if (req.method === 'POST' && pathname === '/api/knowledge') {
    try {
      const { item, consultationId } = await readBody(req);
      return sendJson(res, 200, { ok: true, state: await store.recordMerge(appRoot, item, consultationId) });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message });
    }
  }
  return sendJson(res, 404, { ok: false, error: 'not found' });
}

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (store && pathname.startsWith('/api/')) {
    await api(req, res, pathname);
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const filename = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!filename.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = filename === resolve(root, 'index.html') ? await pageHtml() : await readFile(filename);
    res.writeHead(200, headers(types[extname(filename)] || 'application/octet-stream'));
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// What another server on the port is serving: this build, another build, or something else.
async function servedPage(candidate) {
  try {
    const response = await fetch(`http://127.0.0.1:${candidate}/`, { signal: AbortSignal.timeout(1500) });
    return (await response.text()).replace(RUNTIME_SCRIPT, '');
  } catch {
    return null;
  }
}
async function hasRuntime(candidate) {
  try {
    return (await fetch(`http://127.0.0.1:${candidate}/api/state`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
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
    if ((await hasRuntime(current)) === skills) {
      console.log(`TAKUMI demo (this version${skills ? ', Codex skills' : ''}) is already running: http://127.0.0.1:${current}`);
      process.exit(0);
    }
    console.warn(`ポート${current}では、このデモが${skills ? 'スキル連携なし' : 'スキル連携あり'}で動いています。下に表示するURLを開いてください。`);
  } else {
    console.warn(`Port ${current} is used by ${page?.includes('TAKUMI') ? 'another version of the TAKUMI demo' : 'another program'}.`);
    console.warn(`ポート${current}では${page?.includes('TAKUMI') ? '別のバージョンのTAKUMIデモ' : '別のプログラム'}が動いています。古い画面ではなく、下に表示するURLを開いてください。`);
  }
  current += 1;
  server.listen(current, '127.0.0.1');
});
server.on('listening', async () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  if (store) await store.writeServer(appRoot, { url, pid: process.pid, startedAt: new Date().toISOString() });
  console.log(`TAKUMI demo: ${url}`);
  if (store) console.log('Codexスキル連携：有効（runtime/ と workspace/ を使用）');
  if (current !== port && !store) {
    console.log(`（ポートが変わったため、保存済みの知見は空の状態から始まります。古いデモはそのウィンドウでCtrl+Cを押すと止まります）`);
  }
  console.log('Press Ctrl+C to stop.');
});
server.listen(port, '127.0.0.1');

// Runs one TAKUMI demo skill and prints its result as JSON for Codex.
//   node scripts/run-skill.mjs <skill> [--question "相談文"]
// Starts the skill server (start-demo.mjs --skills) in the background when it
// is not running, so the right-hand screen follows the result.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The skill logic reuses the app's TypeScript modules, which Node.js runs
// directly from 22.6 on. Older versions get a clear message instead of
// "bad option".
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 6)) {
  console.log(
    JSON.stringify(
      {
        skill: process.argv[2] ?? null,
        status: 'error',
        message: `Codexスキルの実行には Node.js 22.12 以降が必要です（現在 ${process.version}）。https://nodejs.org/ からLTS版をインストールしてください。画面だけのデモ（node start-demo.mjs）は Node.js 18 以降で動きます。`,
        next: 'Node.js を更新してから、同じスキルをもう一度実行してください。',
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
if (!process.features?.typescript) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  process.exit(result.status ?? 1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { readServer } = await import('./runtime-store.mjs');
const { runSkill, skills } = await import('./skill-core.ts');

function parse(args) {
  const [name, ...rest] = args;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--question') options.question = rest[(index += 1)];
    else if (rest[index].startsWith('--question=')) options.question = rest[index].slice('--question='.length);
  }
  return { name, ...options };
}

async function reachable(url) {
  try {
    const response = await fetch(`${url}/api/state`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

/** URL of the running skill server; starts one when needed. */
async function ensureServer() {
  const known = await readServer(root);
  if (known?.url && (await reachable(known.url))) return { url: known.url, started: false };
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    throw new Error('dist/index.html がありません。アプリのフォルダで npm ci と npm run build を実行してください。');
  }
  const child = spawn(process.execPath, [join(root, 'start-demo.mjs'), '--skills'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  for (let waited = 0; waited < 10000; waited += 250) {
    await new Promise((done) => setTimeout(done, 250));
    const info = await readServer(root);
    if (info?.url && (await reachable(info.url))) return { url: info.url, started: true };
  }
  throw new Error('デモサーバーを起動できませんでした。アプリのフォルダで npm run demo:start を実行してから、もう一度スキルを実行してください。');
}

const { name, question } = parse(process.argv.slice(2));
if (!name || !skills.includes(name)) {
  console.log(JSON.stringify({ status: 'error', message: `使い方：node scripts/run-skill.mjs <${skills.join('|')}> [--question "相談文"]` }, null, 2));
  process.exit(1);
}
try {
  const server = await ensureServer();
  const result = await runSkill(name, { root, question, url: server.url });
  if (server.started) result.details = { ...result.details, server: `デモサーバーを起動しました（${server.url}）` };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'error' ? 1 : 0);
} catch (error) {
  console.log(JSON.stringify({ skill: name, status: 'error', message: error.message }, null, 2));
  process.exit(1);
}

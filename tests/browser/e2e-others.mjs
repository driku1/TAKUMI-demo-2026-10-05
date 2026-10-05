// Browser walkthrough used for verification (not part of npm test).
// Requires Playwright with a Chromium browser:  npm i -D playwright && npx playwright install chromium
// Usage: node start-demo.mjs  (other terminal)  then  node tests/browser/e2e-others.mjs <screenshot-dir> [http://127.0.0.1:4173/]
import { chromium } from 'playwright';
const out = process.argv[2];
const results = []; const check = (n, ok, d = '') => results.push({ n, ok: Boolean(ok), d });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text()); });
const home = async () => { await p.getByRole('button', { name: 'Consultations' }).first().click(); if (await p.locator('.process-workspace').count()) await p.getByRole('button', { name: 'New consultation' }).first().click(); };
const ask = async ({ chip, text }) => { await home(); if (chip) await p.locator('.sample-chips button', { hasText: chip }).click(); else await p.locator('textarea[aria-label="相談内容"]').fill(text); await p.getByRole('button', { name: /Run agent/ }).click(); await p.waitForTimeout(17300); };
const merge = async () => { await p.getByRole('button', { name: /Open knowledge PR/ }).click(); await p.getByLabel('出典・適用条件・重複候補を確認した').check(); await p.getByRole('button', { name: 'Approve review' }).click(); await p.getByRole('button', { name: /Merge knowledge PR/ }).click(); await p.waitForTimeout(600); };
try {
  await p.goto(process.argv[3] ?? 'http://127.0.0.1:4173/'); await p.evaluate(() => localStorage.clear()); await p.reload();
  for (const [tab, question, sid] of [
    ['薄肉部品の加工変形', '薄肉アルミハウジングの派生品で、壁の形状が変わります。治具と加工工程で、事前に確認すべき点は？', 'aluminum'],
    ['溶接後のひずみ', 'ステンレス製ブラケットの派生品で、溶接箇所が増えます。ひずみを抑えるために、事前に確認すべき点は？', 'welding'],
  ]) {
    await ask({ chip: tab }); await merge();
    const k1 = JSON.parse(await p.evaluate(() => localStorage.getItem('takumi-knowledge'))).find((x) => x.scenarioId === sid);
    await home(); await p.locator('textarea[aria-label="相談内容"]').fill(question);
    await p.getByRole('button', { name: /Run agent/ }).click();
    await p.locator('.run-state', { hasText: 'Answered' }).waitFor({ timeout: 15000 });
    check(`${sid}: typed question answered from knowledge only`, (await p.locator('.execution-log').innerText()).includes('Expert interview skipped'));
    await p.locator('.execution-log button', { hasText: 'Response compiled' }).click();
    check(`${sid}: answer cites the merged ID`, (await p.locator('.reuse-panel').innerText()).includes(k1.id));
    await p.getByRole('button', { name: 'Knowledge Graph' }).first().click();
    await p.locator('.filter-tabs button', { hasText: tab }).click(); await p.waitForTimeout(400);
    check(`${sid}: graph shows ④ with the used knowledge`, (await p.locator('.onto-stage-buttons button[aria-pressed=true]').innerText()).includes('④') && (await p.locator('.onto-page .onto-node.is-used').count()) === 1);
    const lo = await p.evaluate(() => { const L = [...document.querySelectorAll('.onto-page .onto-edge-label rect')].map((r) => r.getBoundingClientRect()); const N = [...document.querySelectorAll('.onto-page .onto-node .outer')].map((r) => r.getBoundingClientRect()); const h = (a, c) => a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1; let x = 0; L.forEach((a, i) => { L.slice(i + 1).forEach((c) => h(a, c) && x++); N.forEach((c) => h(a, c) && x++); }); return x; });
    check(`${sid}: no label overlaps in ④`, lo === 0, `${lo}`);
    await p.locator('.onto-page').screenshot({ path: `${out}/o-${sid}-stage4.png` });
  }
  await p.locator('.filter-tabs button', { hasText: '樹脂成形の品質ばらつき' }).click(); await p.waitForTimeout(300);
  check('molding tab unaffected by other themes', (await p.locator('.onto-page .onto-node.kind-knowledge').count()) === 0);
} catch (e) { check('script completed', false, e.message.split('\n')[0]); }
check('no errors', errors.length === 0, errors.join(' | '));
await b.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  ${r.ok ? '' : r.d}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);

// Browser walkthrough used for verification (not part of npm test).
// Requires Playwright with a Chromium browser:  npm i -D playwright && npx playwright install chromium
// Usage: node start-demo.mjs  (other terminal)  then  node tests/browser/e2e.mjs <screenshot-dir> [http://127.0.0.1:4173/]
import { chromium } from 'playwright';
const out = process.argv[2];
const base = process.argv[3] ?? 'http://127.0.0.1:4173/';
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push('console: ' + m.text()); });
const RELATED = 'この形状を量産する際の注意点は？';
const store = () => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
const gotoGraph = async (tab) => {
  await p.getByRole('button', { name: 'Knowledge Graph' }).first().click();
  if (tab) await p.locator('.filter-tabs button', { hasText: tab }).click();
  await p.waitForTimeout(350);
};
const home = async () => {
  await p.getByRole('button', { name: 'Consultations' }).first().click();
  if (await p.locator('.process-workspace').count()) await p.getByRole('button', { name: 'New consultation' }).first().click();
  await p.waitForTimeout(200);
};
const ask = async ({ chip, text }) => {
  await home();
  if (chip) await p.locator('.sample-chips button', { hasText: chip }).click();
  else await p.locator('textarea[aria-label="相談内容"]').fill(text);
  await p.getByRole('button', { name: /Run agent/ }).click();
  await p.waitForTimeout(17300);
};
const approveMerge = async () => {
  await p.getByRole('button', { name: /Open knowledge PR/ }).click();
  const merge = p.getByRole('button', { name: /Merge knowledge PR/ });
  check('Merge disabled before Approve review', await merge.isDisabled());
  await p.getByLabel('出典・適用条件・重複候補を確認した').check();
  check('Merge disabled with checkbox only', await merge.isDisabled());
  await p.getByRole('button', { name: 'Approve review' }).click();
  await merge.click();
  await p.waitForTimeout(700);
};
const stageBtn = (label) => p.locator('.onto-stage-buttons button', { hasText: label });
const floating = async () => (await p.locator('.onto-page .onto-floating').innerText()).replace(/\s+/g, ' ');
const domCounts = () => p.evaluate(() => ({
  nodes: document.querySelectorAll('.onto-page .onto-node').length,
  edges: document.querySelectorAll('.onto-page .onto-edge').length,
  overlay: document.querySelectorAll('.onto-page .onto-overlay').length,
}));
const overlaps = (scope = '.onto-page') => p.evaluate((scope) => {
  const L = [...document.querySelectorAll(`${scope} .onto-edge-label rect`)].map((r) => r.getBoundingClientRect());
  const N = [...document.querySelectorAll(`${scope} .onto-node .outer`)].map((r) => r.getBoundingClientRect());
  const hit = (a, c) => a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1;
  let ll = 0, ln = 0, nn = 0;
  L.forEach((a, i) => { L.slice(i + 1).forEach((c) => hit(a, c) && ll++); N.forEach((c) => hit(a, c) && ln++); });
  N.forEach((a, i) => N.slice(i + 1).forEach((c) => hit(a, c) && nn++));
  return { labels: L.length, ll, ln, nn };
}, scope);
const clean = (o) => o.ll === 0 && o.ln === 0 && o.nn === 0;

try {
  await p.goto(base);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  const homeText = await p.locator('main').innerText();
  check('Home shows no second-cycle lead-in', !/第2サイクル|第1サイクル|関連相談/.test(homeText));

  // Before anything is merged
  await gotoGraph('樹脂成形の品質ばらつき');
  check('E1 only ① enabled', await stageBtn('① 登録前').isEnabled() && await stageBtn('② 追加後').isDisabled() && await stageBtn('④ 回答での活用').isDisabled());
  const f1 = await floating(); const d1 = await domCounts();
  check('E1 counts equal DOM', f1.includes(`${d1.nodes} NODES`) && f1.includes(`${d1.edges} LINKS`), f1);
  check('E1 no overlaps', clean(await overlaps()));
  const legend = await p.locator('.onto-side').innerText();
  check('E1 sidebar legend names each line type', ['構造・包含', '所属・担当', '参照・出典', '承認', 'タグ一致・本文で言及', '回答で使用（一時表示）'].every((t) => legend.includes(t)));
  check('E1 legend shows line samples', (await p.locator('.onto-side .onto-line-sample').count()) >= 8);

  // Related question before any merge: nothing is claimed
  await ask({ text: RELATED });
  check('E2 no reuse callout without merged knowledge', (await p.locator('.cycle-callout').count()) === 0);
  await p.locator('.execution-log button', { hasText: 'Response compiled' }).click();
  check('E2 no reuse panel without merged knowledge', (await p.locator('.reuse-panel').count()) === 0);
  check('E2 answer leaves storage empty', Object.keys(await store()).length === 0);
  await gotoGraph();
  check('E2 graph: ④ unavailable, no knowledge nodes', await stageBtn('④ 回答での活用').isDisabled() && (await p.locator('.onto-page .onto-node.kind-knowledge').count()) === 0);

  // First consultation, merged
  await ask({ chip: '樹脂成形の品質ばらつき' });
  await approveMerge();
  const k1 = JSON.parse((await store())['takumi-knowledge']).find((x) => x.isNew && x.scenarioId === 'molding');
  check('E3 merged knowledge saved', Boolean(k1));
  check('E3 post-merge graph lists connections', (await p.locator('.onto-connections li').count()) >= 8);
  check('E3 post-merge graph: no lead-in to a second cycle', !(await p.locator('.trace-panel').innerText()).includes('関連相談'));
  await p.locator('.merge-graph').screenshot({ path: `${out}/e3-merge-graph.png` });

  // Related question typed by the presenter
  const beforeAnswer = await store();
  await ask({ text: RELATED });
  await p.locator('.execution-log button', { hasText: 'Registered knowledge found' }).click();
  check('E4 search shows merged knowledge ID', (await p.locator('.cycle-callout').innerText()).includes(k1.id));
  await p.locator('.execution-log button', { hasText: 'Response compiled' }).click();
  const reuse = await p.locator('.reuse-panel').innerText();
  check('E4 answer cites merged knowledge', reuse.includes(k1.id) && reuse.includes(k1.title));
  const quotes = await p.locator('.reuse-checks li.knowledge q').allInnerTexts();
  const saved = [...k1.recommendations.map((r) => r.body), ...k1.provenance.dialogue.map((m) => m.text), k1.conditions, k1.summary];
  check('E4 every quote is saved text', quotes.length > 0 && quotes.every((q) => saved.includes(q.replace(/^「|」$/g, ''))), `${quotes.length}`);
  check('E4 answer graph marks the used knowledge', (await p.locator('.answer-graph .onto-node.is-used').count()) === 1 && (await p.locator('.answer-graph .onto-overlay').count()) >= 1);
  check('E4 answering does not change storage', JSON.stringify(beforeAnswer) === JSON.stringify(await store()));
  await p.locator('.trace-panel').screenshot({ path: `${out}/e4-answer.png` });

  // Graph page while the answer is open
  await gotoGraph('樹脂成形の品質ばらつき');
  check('E5 default stage ④ while the answer is open', (await stageBtn('④ 回答での活用').getAttribute('aria-pressed')) === 'true');
  const f4 = await floating(); const d4 = await domCounts();
  check('E5 ④ counts exclude the overlay and equal DOM', f4.includes(`${d4.nodes} NODES`) && f4.includes(`${d4.edges} LINKS`) && d4.overlay >= 1, f4);
  check('E5 USED node is the merged knowledge', (await p.locator('.onto-page .onto-node.is-used').getAttribute('aria-label')).includes(k1.title.slice(0, 8)));
  check('E5 usage box shows the question and knowledge ID', (await p.locator('.onto-usage').innerText()).includes(k1.id));
  check('E5 ④ no overlaps', clean(await overlaps()));
  await p.locator('.onto-page').screenshot({ path: `${out}/e5-stage4.png` });
  await stageBtn('② 追加後').click(); await p.waitForTimeout(300);
  const d2 = await domCounts();
  check('E5 ② and ④ have the same nodes and links', d2.nodes === d4.nodes && d2.edges === d4.edges && d2.overlay === 0);
  check('E5 ② no overlaps', clean(await overlaps()));
  await p.locator('.onto-page').screenshot({ path: `${out}/e5-stage2.png` });
  await stageBtn('③ 新知見に注目').click(); await p.waitForTimeout(300);
  check('E5 ③ detail shows ID and 適用条件', (await p.locator('.onto-detail').innerText()).includes(k1.id) && (await p.locator('.onto-detail').innerText()).includes('適用条件'));
  await stageBtn('① 登録前').click(); await p.waitForTimeout(200);
  check('E5 ① hides merged knowledge', (await p.locator('.onto-page .onto-node.kind-knowledge').count()) === 0);
  const snap = await store();
  for (let i = 0; i < 6; i++) for (const s of ['④ 回答での活用', '① 登録前', '② 追加後', '③ 新知見に注目']) await stageBtn(s).click({ delay: 0 });
  for (const t of ['薄肉部品の加工変形', '溶接後のひずみ', '樹脂成形の品質ばらつき']) await p.locator('.filter-tabs button', { hasText: t }).click({ delay: 0 });
  await p.waitForTimeout(300);
  check('E5 rapid stage/tab switching keeps storage', JSON.stringify(snap) === JSON.stringify(await store()));
  await p.getByLabel('ドキュメント（既存ナレッジ）').uncheck();
  const hidden = await p.locator('.onto-page .onto-node.kind-document').count();
  await p.getByLabel('ドキュメント（既存ナレッジ）').check();
  check('E5 layer toggle', hidden === 0 && (await p.locator('.onto-page .onto-node.kind-document').count()) > 0);
  const tf = () => p.locator('.onto-page .onto-canvas > svg > g').getAttribute('transform');
  const t0 = await tf(); await p.getByRole('button', { name: '拡大' }).click(); const t1 = await tf();
  check('E5 zoom works', t0 !== t1);
  await p.getByRole('button', { name: '文字サイズを切り替え' }).click();
  check('E5 large text no overlaps', clean(await overlaps()));
  await p.getByRole('button', { name: '文字サイズを切り替え' }).click();
  await p.locator('.filter-tabs button', { hasText: '薄肉部品の加工変形' }).click(); await p.waitForTimeout(200);
  check('E5 other theme shows no molding knowledge', (await p.locator('.onto-page .onto-node.kind-knowledge').count()) === 0);

  // Closing the answer removes the overlay
  await home();
  await gotoGraph('樹脂成形の品質ばらつき');
  check('E6 after New consultation, ④ is gone and ② is default', await stageBtn('④ 回答での活用').isDisabled() && (await stageBtn('② 追加後').getAttribute('aria-pressed')) === 'true');
  await p.reload(); await p.waitForTimeout(300);
  await gotoGraph('樹脂成形の品質ばらつき');
  check('E6 reload keeps merged knowledge, no saved overlay', await stageBtn('② 追加後').isEnabled() && await stageBtn('④ 回答での活用').isDisabled());

  // Merging the related answer too
  await ask({ text: RELATED });
  await approveMerge();
  const all = JSON.parse((await store())['takumi-knowledge']).filter((x) => x.isNew);
  const k2 = all.find((x) => x.scenarioId === 'molding-c2');
  check('E7 second merge keeps the first, records 発展元', all.some((x) => x.id === k1.id) && k2?.provenance.basedOn?.[0].id === k1.id);
  await gotoGraph('樹脂成形の品質ばらつき');
  await stageBtn('② 追加後').click(); await p.waitForTimeout(300);
  check('E7 ② shows both merged notes', (await p.locator('.onto-page .onto-node.kind-knowledge').count()) === 2);
  check('E7 ② no overlaps with both notes', clean(await overlaps()));
  await p.getByRole('button', { name: 'Knowledge Library' }).first().click();
  await p.locator('.library-list .knowledge-row', { hasText: k2.title.slice(0, 12) }).click();
  check('E7 article shows 発展元', (await p.locator('[role=dialog]').innerText()).includes('発展元'));
  await p.getByRole('button', { name: '閉じる', exact: true }).click();

  // Data saved by the 10-04 version
  await p.evaluate(() => {
    localStorage.setItem('takumi-knowledge', JSON.stringify([{ id: 'legacy-1004-0001', title: '樹脂カバーのリブ裏のヒケ対策（10-04保存）', summary: 'ヒケの位置と、保圧を変えた際の重量・外観の変化を一緒に記録する。', tags: ['射出成形', '金型設計', 'ヒケ'], author: '鈴木 健二', date: '2026.10.4', isNew: true,
      recommendations: [{ title: '設計：リブ根元の肉だまりを減らす', body: 'リブの交差部や根元の肉厚を見直し、強度と充填性を確保できる形状を検討する。' }, { title: '工程：変数を一つずつ比較する', body: '材料の状態と金型温度をそろえ、保圧条件を段階的に変更して重量と外観を記録する。' }],
      conditions: '架空の射出成形事例です。', provenance: { question: '樹脂カバーのヒケ', sourceIds: ['k3', 'seed-2-8'], dialogue: [], review: { reviewer: '鈴木 健二', comment: 'ok', mergedAt: '2026-10-04T10:00:00Z', simulated: true } } }]));
  });
  await p.reload(); await p.waitForTimeout(300);
  await gotoGraph('樹脂成形の品質ばらつき');
  check('E8 10-04 saved note appears as merged knowledge', (await p.locator('.onto-page .onto-node.kind-knowledge').count()) === 1);
  await ask({ text: RELATED });
  await p.locator('.execution-log button', { hasText: 'Response compiled' }).click();
  check('E8 related question uses the 10-04 note', (await p.locator('.reuse-panel').innerText()).includes('legacy-1004-0001'));

  // Mobile
  await p.setViewportSize({ width: 390, height: 844 });
  await p.getByRole('button', { name: 'メニューを開く' }).click();
  await gotoGraph('樹脂成形の品質ばらつき');
  check('E9 mobile: no horizontal page scroll', (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  check('E9 mobile: detail panel not auto-opened', (await p.locator('.onto-detail').count()) === 0);
  await p.screenshot({ path: `${out}/e9-mobile.png`, fullPage: true });
  await p.setViewportSize({ width: 1440, height: 900 });

  // Home card matches the graph page
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  const card = await p.locator('.onto-card-label').innerText();
  await gotoGraph('薄肉部品の加工変形');
  const m = card.match(/(\d+) NODES · (\d+) LINKS/);
  check('E10 home card counts equal graph page', m && (await floating()).includes(`${m[1]} NODES · ${m[2]} LINKS`), card);
} catch (e) {
  check('Script completed', false, e.message.split('\n')[0]);
}
check('No page/console errors', errors.length === 0, errors.join(' | '));
await b.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  — ' + r.detail}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);

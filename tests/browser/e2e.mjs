// Browser walkthrough used for verification (not part of npm test).
// Requires Playwright with a Chromium browser:  npm i -D playwright && npx playwright install chromium
// Usage: node start-demo.mjs  (other terminal)  then  node tests/browser/e2e.mjs <screenshot-dir> [http://127.0.0.1:4173/]
import { chromium } from 'playwright';
const out = process.argv[2];
const base = process.argv[3] ?? 'http://127.0.0.1:4173/';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push('console: ' + m.text()); });
const ls = () => p.evaluate(() => ({ k: localStorage.getItem('takumi-knowledge'), u: localStorage.getItem('takumi-knowledge-usage') }));
const gotoGraph = async (tab) => {
  await p.getByRole('button', { name: 'Knowledge Graph' }).first().click();
  if (tab) await p.locator('.filter-tabs button', { hasText: tab }).click();
  await p.waitForTimeout(350);
};
const gotoHome = async () => { await p.getByRole('button', { name: 'Consultations' }).first().click(); await p.waitForTimeout(200); };
const runChip = async (chip) => {
  await gotoHome();
  const newBtn = p.getByRole('button', { name: 'New consultation' });
  if (await p.locator('.process-workspace').count()) await newBtn.first().click();
  await p.locator('.sample-chips button', { hasText: chip }).first().click();
  await p.getByRole('button', { name: /Run agent/ }).click();
  await p.waitForTimeout(17300);
};
const approveMerge = async () => {
  await p.getByRole('button', { name: /Open knowledge PR/ }).click();
  const merge = p.getByRole('button', { name: /Merge knowledge PR/ });
  check('Merge is disabled before Approve review', await merge.isDisabled());
  await p.getByLabel('出典・適用条件・重複候補を確認した').check();
  check('Merge still disabled after checkbox only', await merge.isDisabled());
  await p.getByRole('button', { name: 'Approve review' }).click();
  await merge.click();
  await p.waitForTimeout(700);
};
const stageBtn = (label) => p.locator('.onto-stage-buttons button', { hasText: label });
const floating = async () => (await p.locator('.onto-page .onto-floating').innerText()).replace(/\s+/g, ' ');
const domCounts = () => p.evaluate(() => ({ nodes: document.querySelectorAll('.onto-page .onto-node').length, edges: document.querySelectorAll('.onto-page .onto-edge').length }));
const labelOverlaps = () => p.evaluate(() => {
  const boxes = [...document.querySelectorAll('.onto-page .onto-edge-label rect')].map(r => r.getBoundingClientRect());
  const nodes = [...document.querySelectorAll('.onto-page .onto-node .outer')].map(r => r.getBoundingClientRect());
  const hit = (a, c) => a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1;
  let ll = 0, ln = 0;
  boxes.forEach((a, i) => { boxes.slice(i + 1).forEach(c => { if (hit(a, c)) ll++; }); nodes.forEach(n => { if (hit(a, n)) ln++; }); });
  let nn = 0; nodes.forEach((a, i) => nodes.slice(i + 1).forEach(c => { if (hit(a, c)) nn++; }));
  return { labels: boxes.length, ll, ln, nn };
});

try {
await p.goto(base);
await p.evaluate(() => localStorage.clear());
await p.reload();

// E1 fresh graph
await gotoGraph('樹脂成形の品質ばらつき');
check('E1 fresh: only ① enabled', await stageBtn('① 登録前').isEnabled() && await stageBtn('② 追加後').isDisabled() && await stageBtn('③ 新知見に注目').isDisabled() && await stageBtn('④ 第2サイクルで活用').isDisabled());
const f1 = await floating(); const d1 = await domCounts();
check('E1 floating counts equal DOM', f1.includes(`${d1.nodes} NODES`) && f1.includes(`${d1.edges} LINKS`), f1 + ' / ' + JSON.stringify(d1));
const lo1 = await labelOverlaps();
check('E1 no label/node overlaps on screen', lo1.ll === 0 && lo1.ln === 0 && lo1.nn === 0, JSON.stringify(lo1));
await p.locator('.onto-page').screenshot({ path: out + '/e1-before.png' });

// E2 cycle 2 without cycle 1
await gotoHome();
const chipState = await p.locator('.cycle-two-chips button', { hasText: '形状の量産時の注意点' }).innerText();
check('E2 cycle-2 chip shows 未登録', chipState.includes('未登録'), chipState);
await runChip('形状の量産時の注意点');
await p.locator('.execution-log button', { hasText: 'No registered knowledge used' }).click();
const callout = await p.locator('.cycle-callout').innerText();
check('E2 search callout says not registered', callout.includes('未登録'), callout);
await p.locator('.execution-log button', { hasText: 'Response compiled' }).click();
const reuse = await p.locator('.reuse-panel').innerText();
check('E2 answer does not claim usage', reuse.includes('登録知見は使用していません') && !reuse.includes('登録知見を使用'), reuse.slice(0, 120));
check('E2 no usage record stored', !(await ls()).u);
await p.screenshot({ path: out + '/e2-c2-unregistered.png', fullPage: true });

// E3 cycle 1
await runChip('樹脂成形の品質ばらつき');
await approveMerge();
const store3 = JSON.parse((await ls()).k);
const k1 = store3.find(x => x.isNew && x.scenarioId === 'molding');
check('E3 cycle-1 knowledge saved with scenarioId', Boolean(k1), k1?.id);
const conn = await p.locator('.onto-connections li').count();
check('E3 post-merge graph lists connections', conn >= 8, `${conn} connections`);
const inlineNew = await p.locator('.onto-inline .onto-node.is-new').count();
check('E3 post-merge graph shows NEW nodes', inlineNew >= 1, `${inlineNew}`);
await p.locator('.merge-graph').screenshot({ path: out + '/e3-merge-graph.png' });

// E4 cycle 2 with cycle-1 knowledge
await p.getByRole('button', { name: /関連相談を準備/ }).click();
check('E4 related consultation prepared', (await p.locator('textarea[aria-label="相談内容"]').inputValue()) === 'この形状を量産する際の注意点は？');
await p.getByRole('button', { name: /Run agent/ }).click();
await p.waitForTimeout(17300);
await p.locator('.execution-log button', { hasText: 'Registered knowledge found' }).click();
const callout4 = await p.locator('.cycle-callout').innerText();
check('E4 search callout shows K1 full ID', callout4.includes(k1.id), callout4);
const hitRow = await p.locator('.retrieved-list .cycle-one-hit').innerText();
check('E4 K1 appears in retrieved list', hitRow.includes(k1.title), hitRow.slice(0, 80));
await p.locator('.execution-log button', { hasText: 'Response compiled' }).click();
const reuse4 = await p.locator('.reuse-panel').innerText();
check('E4 answer cites K1 ID and title', reuse4.includes(k1.id) && reuse4.includes(k1.title) && reuse4.includes(k1.id.slice(0, 8)), reuse4.slice(0, 160));
const quotes = await p.locator('.reuse-checks li.knowledge q').allInnerTexts();
const k1Text = [...k1.recommendations.map(r => r.body), ...k1.provenance.dialogue.map(m => m.text), k1.conditions, k1.summary];
check('E4 every cited passage is text of saved K1', quotes.length > 0 && quotes.every(q => k1Text.includes(q.replace(/^「|」$/g, ''))), `${quotes.length} quotes`);
const usage = JSON.parse((await ls()).u ?? '[]');
check('E4 usage record stored with K1 ID', usage.length === 1 && usage[0].usedKnowledge[0].id === k1.id);
const checksDom = await p.locator('.reuse-checks > li').count();
check('E4 usage record checks equal displayed checks', usage[0]?.checks.length === checksDom, `${usage[0]?.checks.length} vs ${checksDom}`);
await p.locator('.trace-panel').screenshot({ path: out + '/e4-c2-response.png' });
await approveMerge();
const store4 = JSON.parse((await ls()).k);
const k2 = store4.find(x => x.isNew && x.scenarioId === 'molding-c2');
check('E4 K2 saved, K1 kept, basedOn K1', Boolean(k2) && store4.some(x => x.id === k1.id) && k2.provenance.basedOn[0].id === k1.id);
await p.locator('.merge-graph').screenshot({ path: out + '/e4-merge-graph.png' });

// E5 graph page
await gotoGraph('樹脂成形の品質ばらつき');
check('E5 default stage is ④', (await stageBtn('④ 第2サイクルで活用').getAttribute('aria-pressed')) === 'true');
const usedNode = p.locator('.onto-page .onto-node.is-used');
check('E5 USED node is K1', (await usedNode.count()) === 1 && (await usedNode.getAttribute('aria-label')).includes(k1.title.slice(0, 10)));
const detail = await p.locator('.onto-detail').innerText();
const allChecksInDetail = usage[0].checks.every(c => detail.includes(c.label));
check('E5 answer detail lists the same checks as the answer', allChecksInDetail);
const usedEdgeCount = await p.locator('.onto-page .onto-edge.is-used').count();
check('E5 USED relations drawn', usedEdgeCount >= 3, `${usedEdgeCount}`);
const f5 = await floating(); const d5 = await domCounts();
check('E5 floating counts equal DOM (④)', f5.includes(`${d5.nodes} NODES`) && f5.includes(`${d5.edges} LINKS`), f5);
const lo5 = await labelOverlaps();
check('E5 no label/node overlaps on screen (④)', lo5.ll === 0 && lo5.ln === 0 && lo5.nn === 0, JSON.stringify(lo5));
for (const s of ['① 登録前', '② 追加後', '③ 新知見に注目']) {
  await stageBtn(s).click(); await p.waitForTimeout(250);
  const f = await floating(); const d = await domCounts(); const lo = await labelOverlaps();
  check(`E5 ${s}: counts match DOM and no overlaps`, f.includes(`${d.nodes} NODES`) && f.includes(`${d.edges} LINKS`) && lo.ll === 0 && lo.ln === 0 && lo.nn === 0, f + ' ' + JSON.stringify(lo));
}
check('E5 ③ detail shows K1 ID', (await p.locator('.onto-detail').innerText()).includes(k1.id));
await stageBtn('① 登録前').click(); await p.waitForTimeout(200);
check('E5 ① hides saved knowledge', (await p.locator('.onto-page .onto-node.kind-knowledge').count()) === 0);
const before = await ls();
// rapid clicking
for (let i = 0; i < 6; i++) for (const s of ['④ 第2サイクルで活用', '① 登録前', '② 追加後', '③ 新知見に注目']) await stageBtn(s).click({ delay: 0 });
for (const t of ['薄肉部品の加工変形', '溶接後のひずみ', '樹脂成形の品質ばらつき', '溶接後のひずみ', '樹脂成形の品質ばらつき']) await p.locator('.filter-tabs button', { hasText: t }).click({ delay: 0 });
await p.waitForTimeout(400);
check('E5 rapid clicks keep data unchanged', JSON.stringify(before) === JSON.stringify(await ls()));
check('E5 after tab switching back, ④ is default again', (await stageBtn('④ 第2サイクルで活用').getAttribute('aria-pressed')) === 'true');
// layers
await p.getByLabel('ドキュメント（既存ナレッジ）').uncheck();
const docsHidden = await p.locator('.onto-page .onto-node.kind-document').count();
await p.getByLabel('ドキュメント（既存ナレッジ）').check();
const docsShown = await p.locator('.onto-page .onto-node.kind-document').count();
check('E5 layer toggle hides/shows documents', docsHidden === 0 && docsShown > 0, `${docsHidden}/${docsShown}`);
// zoom
const tf = () => p.locator('.onto-page .onto-canvas > svg > g').getAttribute('transform');
const t0 = await tf(); await p.getByRole('button', { name: '拡大' }).click(); const t1 = await tf();
const box = await p.locator('.onto-page .onto-canvas > svg').boundingBox();
await p.mouse.move(box.x + 300, box.y + 300); await p.mouse.wheel(0, 300); await p.waitForTimeout(100); const t2 = await tf();
await p.mouse.down(); await p.mouse.move(box.x + 380, box.y + 340, { steps: 4 }); await p.mouse.up(); const t3 = await tf();
check('E5 zoom button, wheel and drag change the view', t0 !== t1 && t1 !== t2 && t2 !== t3);
await p.getByRole('button', { name: '文字サイズを切り替え' }).click();
const lo6 = await labelOverlaps();
check('E5 large text: no label/node overlaps', lo6.ll === 0 && lo6.ln === 0 && lo6.nn === 0, JSON.stringify(lo6));
await p.getByRole('button', { name: '文字サイズを切り替え' }).click();
// other tab
await p.locator('.filter-tabs button', { hasText: '薄肉部品の加工変形' }).click(); await p.waitForTimeout(250);
check('E7 other theme shows only ① (no molding knowledge)', await stageBtn('② 追加後').isDisabled() && (await p.locator('.onto-page .onto-node.kind-knowledge').count()) === 0);
// E6 reload
await p.reload(); await p.waitForTimeout(400);
check('E6 storage unchanged after stage switching + reload', JSON.stringify(before) === JSON.stringify(await ls()));
await gotoGraph('樹脂成形の品質ばらつき');
check('E6 after reload ④ still available', await stageBtn('④ 第2サイクルで活用').isEnabled());
// E8 article modal
await p.getByRole('button', { name: 'Knowledge Library' }).first().click();
await p.locator('.library-list .knowledge-row', { hasText: k1.title }).click();
const art1 = await p.locator('[role=dialog]').innerText();
check('E8 K1 article shows second-cycle usage', art1.includes('第2サイクルでの活用'));
await p.getByRole('button', { name: '閉じる' }).click();
await p.locator('.library-list .knowledge-row', { hasText: k2.title.slice(0, 12) }).click();
const art2 = await p.locator('[role=dialog]').innerText();
check('E8 K2 article shows 発展元 K1', art2.includes('発展元') && art2.includes(k1.title));
await p.getByRole('button', { name: '閉じる' }).click();
// E9 corrupted usage storage
await p.evaluate(() => localStorage.setItem('takumi-knowledge-usage', '{broken'));
await p.reload(); await p.waitForTimeout(400);
await gotoGraph('樹脂成形の品質ばらつき');
const notice = await p.locator('.onto-notice').count() ? await p.locator('.onto-notice').innerText() : '';
check('E9 broken usage storage: app works, no USED shown, notice shown', (await p.locator('.onto-page .onto-edge.is-used').count()) === 0 && notice.includes('使っていません'), notice);
// E10 legacy 10-04 data
await p.evaluate(() => {
  const legacy = { id: 'legacy-1004-0001', title: '樹脂カバーのリブ裏のヒケ対策（10-04保存）', summary: 'ヒケの位置と、保圧を変えた際の重量・外観の変化を一緒に記録する。', tags: ['射出成形', '金型設計', 'ヒケ'], author: '鈴木 健二', date: '2026.10.4', isNew: true,
    recommendations: [{ title: '設計：リブ根元の肉だまりを減らす', body: 'リブの交差部や根元の肉厚を見直し、強度と充填性を確保できる形状を検討する。' }, { title: '工程：変数を一つずつ比較する', body: '材料の状態と金型温度をそろえ、保圧条件を段階的に変更して重量と外観を記録する。' }],
    conditions: '架空の射出成形事例です。', provenance: { question: '樹脂カバーのヒケ', sourceIds: ['k3', 'seed-2-8'], dialogue: [], review: { reviewer: '鈴木 健二', comment: 'ok', mergedAt: '2026-10-04T10:00:00Z', simulated: true } } };
  localStorage.setItem('takumi-knowledge', JSON.stringify([legacy]));
  localStorage.removeItem('takumi-knowledge-usage');
});
await p.reload(); await p.waitForTimeout(400);
await gotoGraph('樹脂成形の品質ばらつき');
check('E10 legacy 10-04 note shown as cycle-1 knowledge (②)', (await stageBtn('② 追加後').getAttribute('aria-pressed')) === 'true' && (await p.locator('.onto-page .onto-node.kind-knowledge').count()) === 1);
await runChip('形状の量産時の注意点');
await p.locator('.execution-log button', { hasText: 'Response compiled' }).click();
check('E10 cycle 2 uses the legacy note', (await p.locator('.reuse-panel').innerText()).includes('legacy-1004-0001'));
await p.locator('.trace-panel').screenshot({ path: out + '/e10-legacy-response.png' });
// E11 mobile
await p.setViewportSize({ width: 390, height: 844 });
await p.getByRole('button', { name: 'メニューを開く' }).click();
await gotoGraph('樹脂成形の品質ばらつき');
await p.waitForTimeout(400);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('E11 mobile graph page has no horizontal page scroll', overflow <= 0, `${overflow}px`);
await p.screenshot({ path: out + '/e11-mobile-graph.png', fullPage: true });
await p.setViewportSize({ width: 1440, height: 900 });
// home card counts consistent with page default
await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
const card = await p.locator('.onto-card-label').innerText();
await gotoGraph('薄肉部品の加工変形');
const pageF = await floating();
const m = card.match(/(\d+) NODES · (\d+) LINKS/);
check('E12 home card counts equal graph page counts', m && pageF.includes(`${m[1]} NODES · ${m[2]} LINKS`), card + ' / ' + pageF);
await gotoHome(); await p.screenshot({ path: out + '/e12-home.png' });

} catch (e) { check('Script completed', false, e.message.split('\n')[0]); }
check('No page/console errors', errors.length === 0, errors.join(' | '));
await b.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n${results.filter(r => r.ok).length}/${results.length} passed`);

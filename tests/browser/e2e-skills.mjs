// Codex skill mode walkthrough (not part of npm test). Runs the six skills the
// way Codex does (node scripts/run-skill.mjs …) and checks that the screen
// follows, that Approve review / Merge stay with the person on the screen, and
// that a question the Merged knowledge answers skips the expert by itself.
// Usage: node tests/browser/e2e-skills.mjs <app-folder> <screenshot-dir>
//   (app-folder: a built copy of the demo; its runtime/ and workspace/ are reset)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [app, out] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const skill = (name, question) => {
  const args = [join(app, 'scripts', 'run-skill.mjs'), name, ...(question ? ['--question', question] : [])];
  try {
    return JSON.parse(execFileSync(process.execPath, args, { cwd: app, encoding: 'utf8' }));
  } catch (error) {
    return JSON.parse(error.stdout);
  }
};
const stored = () => JSON.parse(readFileSync(join(app, 'runtime', 'knowledge.json'), 'utf8'));
const MOLDING = '樹脂カバーの射出成形で、リブの裏側にヒケが発生します。外観品質を安定させるために、設計と成形条件の両面から改善したいです。';
const RELATED = 'この形状を量産する際の注意点は？';

execFileSync(process.execPath, [join(app, 'scripts', 'reset-demo.mjs')], { cwd: app });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push('console: ' + m.text()); });
const hint = () => p.locator('.skill-hint').innerText();
const log = () => p.locator('.execution-log').innerText();
const toast = (text) => p.locator('.toast', { hasText: text }).waitFor({ timeout: 6000 }).then(() => true, () => false);

try {
  // 1. takumi-launch starts the server when needed and shows the graph
  const launch = skill('takumi-launch');
  check('launch: success and starts the server', launch.status === 'success' && /^http:\/\/127\.0\.0\.1:\d+$/.test(launch.url), launch.message);
  check('launch: reports knowledge, experts and graph counts', launch.details.knowledge === 40 && launch.details.experts === 24 && launch.details.graph.nodes > 0);
  await p.goto(launch.url);
  await p.locator('.onto-page').waitFor({ timeout: 5000 });
  check('launch: screen shows the Knowledge Graph', (await p.locator('.onto-stage-buttons button[aria-pressed=true]').innerText()).includes('①'));

  // Steps after the search refuse to run without a consultation
  check('expert-matching before a consultation is refused', skill('expert-matching').status === 'error');

  // 2. design-consultation: search, then wait for the next skill
  const first = skill('design-consultation', MOLDING);
  check('consultation: interview needed, artifact written', first.status === 'success' && first.mode === 'interview' && first.artifacts.some((f) => f.endsWith('01-knowledge-search.md')));
  check('consultation: toast on screen', await toast('Skill完了: design-consultation'));
  await p.locator('.process-workspace').waitFor({ timeout: 5000 });
  await p.locator('.run-state', { hasText: 'Waiting for skill' }).waitFor({ timeout: 8000 });
  check('consultation: screen stops at Knowledge Search and asks for $expert-matching', (await hint()).includes('$expert-matching') && (await log()).includes('Knowledge retrieved') && !(await log()).includes('Experts matched'));
  check('consultation: request text on screen', (await p.locator('.run-context').innerText()).includes('リブの裏側にヒケ'));
  check('out of order: interview before the plan is refused', skill('expert-interview').status === 'error');

  // 3. expert-matching
  const matching = skill('expert-matching');
  check('expert-matching: candidates and expected graphs', matching.status === 'success' && matching.details.candidates.length === 5);
  await p.locator('.spot-layout .onto-embed').waitFor({ timeout: 8000 });
  check('expert-matching: screen shows the whole ontology and the five candidates', (await p.locator('.candidate-pick').count()) === 5 && (await p.locator('.spot-layout .onto-node.is-candidate').count()) === 5 && (await p.locator('.spot-layout .spot-graph .portrait').count()) === 0 && (await p.locator('.candidate-pick .portrait').count()) === 5 && (await hint()).includes('$interview-plan'));
  await p.locator('.candidate-pick').first().click();
  await p.waitForTimeout(1000);
  check('expert-matching: the presenter picks a name and the map lights where they can add knowledge', (await p.locator('.spot-layout .onto-node.is-temporary').count()) === 1 && (await p.locator('.spot-layout .onto-node.is-target').count()) >= 2);
  await p.locator('.spot-layout').screenshot({ path: `${out}/k2-expert-matching.png` });

  // 4. interview-plan
  const plan = skill('interview-plan');
  check('interview-plan: Q1 from retrieved knowledge and the gap', plan.status === 'success' && plan.details.questions.length === 1 && plan.details.questions[0].knownFrom.length > 0);
  await p.locator('.plan-graph .onto-node.kind-question').first().waitFor({ timeout: 8000 });
  check('interview-plan: screen shows notes → point to confirm → Q1 only', (await p.locator('.plan-graph .onto-node.kind-question').count()) === 1 && (await p.locator('.plan-graph .onto-node.kind-gap').count()) === 1 && (await hint()).includes('$expert-interview'));
  await p.waitForTimeout(1600);
  await p.locator('.plan-graph').screenshot({ path: `${out}/k3-plan.png` });

  // 5. expert-interview plays the dialogue, then the response
  const interview = skill('expert-interview');
  check('expert-interview: response and labelled demo answers', interview.status === 'success' && interview.message.includes('デモ用に準備'));
  await p.locator('.run-state', { hasText: 'Pending review' }).waitFor({ timeout: 20000 });
  check('expert-interview: screen ends on the Design Response', (await p.locator('.trace-panel').innerText()).includes('Design recommendation') && (await hint()).includes('$knowledge-pr'));

  // 6. knowledge-pr opens the PR but does not merge
  const pr = skill('knowledge-pr');
  check('knowledge-pr: PR drafted, nothing merged', pr.status === 'success' && stored().length === 0 && pr.artifacts.some((f) => f.endsWith('06-knowledge-pr.md')));
  const mergeButton = p.getByRole('button', { name: /Merge knowledge PR/ });
  await mergeButton.waitFor({ timeout: 8000 });
  check('knowledge-pr: PR screen open, Merge waits for the person', await mergeButton.isDisabled() && (await hint()).includes('Approve review'));
  await p.locator('.trace-panel').screenshot({ path: `${out}/k6-pr.png` });

  // The person approves and merges on the screen
  await p.getByLabel('出典・適用条件・重複候補を確認した').check();
  await p.getByRole('button', { name: 'Approve review' }).click();
  await mergeButton.click();
  await p.locator('.run-state', { hasText: 'Merged' }).waitFor({ timeout: 5000 });
  await p.waitForTimeout(1500);
  const merged = stored();
  check('merge on screen: saved on the demo server', merged.length === 1 && merged[0].scenarioId === 'molding');
  check('merge on screen: no browser storage used', (await p.evaluate(() => localStorage.getItem('takumi-knowledge'))) === null);
  check('knowledge-pr again: already merged', skill('knowledge-pr').status === 'skipped');

  // Same consultation again: answered from the Merged knowledge, no expert
  const again = skill('design-consultation', MOLDING);
  check('same question: knowledge-only, cites the merged note', again.mode === 'knowledge-only' && again.details.registeredKnowledge?.id === merged[0].id && again.artifacts.some((f) => f.endsWith('02-design-response.md')));
  await p.locator('.run-state', { hasText: 'Answered' }).waitFor({ timeout: 8000 });
  const againLog = await log();
  check('same question: screen goes retrieved → found → skipped → response', ['Knowledge retrieved', 'Registered knowledge found', 'Expert interview skipped', 'Response compiled'].every((t) => againLog.includes(t)) && !againLog.includes('Experts matched'));
  await p.locator('.execution-log button', { hasText: 'Response compiled' }).click();
  check('same question: answer cites the merged note', (await p.locator('.reuse-panel').innerText()).includes(merged[0].id));
  const skipped = skill('expert-matching');
  check('expert-matching after a knowledge-only answer is skipped', skipped.status === 'skipped' && await toast('登録知見だけで回答済み'));

  // Related question: Merged note + existing note seed-2-7
  const related = skill('design-consultation', RELATED);
  check('related question: knowledge-only with seed-2-7', related.mode === 'knowledge-only' && related.details.checks.some((c) => c.sources.some((s) => s.includes('seed-2-7'))));
  await p.locator('.run-state', { hasText: 'Answered' }).waitFor({ timeout: 8000 });
  await p.locator('.execution-log button', { hasText: 'Response compiled' }).click();
  check('related question: screen cites the merged note and seed-2-7', (await p.locator('.reuse-panel').innerText()).includes('seed-2-7'));
  await p.locator('.trace-panel').screenshot({ path: `${out}/k7-related.png` });

  // Reloading keeps the current step
  await p.reload();
  await p.locator('.run-state', { hasText: 'Answered' }).waitFor({ timeout: 5000 });
  check('reload: the current consultation is restored', (await p.locator('.run-context').innerText()).includes(RELATED));

  // Reset returns the open screen to the start
  execFileSync(process.execPath, [join(app, 'scripts', 'reset-demo.mjs')], { cwd: app });
  await p.locator('.process-workspace').waitFor({ state: 'detached', timeout: 6000 });
  await p.waitForTimeout(1200);
  check('reset: screen back to the start, no Merged knowledge', (await p.locator('.nav-count').innerText()) === '40' && stored().length === 0);
} catch (e) {
  check('Script completed', false, e.message.split('\n')[0]);
}
check('No page/console errors', errors.length === 0, errors.join(' | '));
await b.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  — ' + r.detail}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);

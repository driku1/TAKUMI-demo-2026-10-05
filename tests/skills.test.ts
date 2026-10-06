import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { followUpScenarios, initialKnowledge, scenarios } from "../src/data.ts";
import { runSkill } from "../scripts/skill-core.ts";
import {
  readKnowledge,
  readState,
  recordMerge,
  resetRuntime,
} from "../scripts/runtime-store.mjs";
import { consultAndMerge } from "./helpers.ts";

const [, , molding] = scenarios;
const slide = followUpScenarios[2];

async function withApp(body: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "takumi-skills-"));
  try {
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const read = (root: string, file: string) => readFileSync(join(root, file), "utf8");

test("6つのスキルで相談からPR作成まで進み、各工程で画面の進み先と成果物を残す（マージはしない）", () =>
  withApp(async (root) => {
    const launch = await runSkill("takumi-launch", { root });
    assert.equal(launch.status, "success");
    assert.equal((await readState(root)).screen, "graph");

    const search = await runSkill("design-consultation", { root, question: molding.question });
    assert.equal(search.mode, "interview");
    assert.equal(search.consultationId, "TKM-001");
    let state = await readState(root);
    assert.deepEqual(
      [state.screen, state.consultation.stage, state.consultation.targetTick],
      ["consultation", "search", 1],
    );
    assert.match(read(root, search.artifacts[0]), /Knowledge gap/);

    const ticks: number[] = [];
    for (const name of ["expert-matching", "interview-plan", "expert-interview"]) {
      const result = await runSkill(name, { root });
      assert.equal(result.status, "success", name);
      assert.ok(result.artifacts.every((file) => existsSync(join(root, file))), name);
      state = await readState(root);
      ticks.push(state.consultation.targetTick);
    }
    assert.deepEqual(ticks, [2, 3, 9], "the screen stops at each step");
    assert.match(read(root, "workspace/TKM-001/04-interview.md"), /デモ用に準備した回答/);

    const pr = await runSkill("knowledge-pr", { root });
    assert.equal(pr.status, "success");
    state = await readState(root);
    assert.deepEqual([state.consultation.stage, state.consultation.step], ["pr", 5]);
    assert.deepEqual(await readKnowledge(root), [], "a skill never merges");
    assert.match(read(root, pr.artifacts[0]), /Approve review と Merge は画面で人が行います/);
    assert.deepEqual(state.completedSkills, [
      "takumi-launch",
      "design-consultation",
      "expert-matching",
      "interview-plan",
      "expert-interview",
      "knowledge-pr",
    ]);
  }));

test("順番が違う・相談がないスキルは実行せず、何をすればよいかを返す", () =>
  withApp(async (root) => {
    assert.equal((await runSkill("expert-matching", { root })).status, "error");
    await runSkill("design-consultation", { root, question: molding.question });
    for (const name of ["expert-interview", "knowledge-pr"]) {
      const result = await runSkill(name, { root });
      assert.equal(result.status, "error", name);
      assert.match(result.next, /^\$/);
    }
    assert.equal((await readState(root)).consultation.stage, "search");
    assert.equal((await runSkill("unknown", { root })).status, "error");
  }));

test("人がMergeした後は、同じ相談・関連する質問を登録知見だけで自動的に回答し、後続スキルは不要と返す", () =>
  withApp(async (root) => {
    await runSkill("design-consultation", { root, question: molding.question });
    const { item } = consultAndMerge(molding, initialKnowledge);
    await recordMerge(root, item, "TKM-001");
    const merged = await readState(root);
    assert.deepEqual([merged.consultation.stage, merged.consultation.merged], ["merged", item.id]);

    const again = await runSkill("design-consultation", { root, question: molding.question });
    assert.equal(again.mode, "knowledge-only");
    assert.match(again.message, /専門家の選定|匠の選定/);
    const state = await readState(root);
    assert.deepEqual([state.consultation.stage, state.consultation.targetTick], ["answered", 9]);
    const answer = read(root, again.artifacts[1]);
    for (const recommendation of item.recommendations ?? []) assert.ok(answer.includes(recommendation.body));
    for (const name of ["expert-matching", "interview-plan", "expert-interview", "knowledge-pr"]) {
      assert.equal((await runSkill(name, { root })).status, "skipped", name);
    }

    const related = await runSkill("design-consultation", { root, question: slide.question });
    assert.equal(related.mode, "knowledge-only");
    assert.ok(read(root, related.artifacts[1]).includes("seed-2-7"));
    assert.equal(related.consultationId, "TKM-003");
  }));

test("Mergeは承認済みの知見だけを受け付け、初期化で相談・登録知見・成果物を消す", () =>
  withApp(async (root) => {
    const { item } = consultAndMerge(molding, initialKnowledge);
    await assert.rejects(recordMerge(root, { ...item, isNew: false }, null));
    await assert.rejects(recordMerge(root, { ...item, provenance: undefined }, null));
    await runSkill("design-consultation", { root, question: molding.question });
    await recordMerge(root, item, "TKM-001");
    const before = await readState(root);
    await resetRuntime(root);
    const after = await readState(root);
    assert.ok(after.revision > before.revision);
    assert.notEqual(after.resetAt, before.resetAt);
    assert.equal(after.consultation, null);
    assert.deepEqual(await readKnowledge(root), []);
    assert.equal(existsSync(join(root, "workspace")), false);
  }));

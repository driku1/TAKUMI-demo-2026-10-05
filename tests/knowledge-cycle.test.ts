import assert from "node:assert/strict";
import test from "node:test";

import {
  followUpScenarios,
  initialKnowledge,
  matchScenario,
  scenarios,
  type Knowledge,
} from "../src/data.ts";
import {
  addKnowledgeOnce,
  answerBasis,
  canMergeKnowledge,
  cycleOneKnowledge,
  latestUsageFor,
  prepareRun,
} from "../src/knowledge-cycle.ts";
import { answerFollowUp, consultAndMerge } from "./helpers.ts";

const [aluminum, welding, molding] = scenarios;
const slide = followUpScenarios.find((item) => item.id === "molding-c2")!;

test("相談文は第1サイクル・第2サイクルのシナリオへ振り分けられる", () => {
  for (const scenario of [...scenarios, ...followUpScenarios]) {
    assert.equal(matchScenario(scenario.question).id, scenario.id);
  }
  assert.equal(matchScenario("この形状を量産する際の注意点は？").id, "molding-c2");
});

test("スライド用の関連相談は収縮差・リブ周辺・ゲート位置・冷却回路を扱い、材質や数値を断定しない", () => {
  const content = JSON.stringify(slide);
  for (const word of ["冷却時の収縮差", "リブ周辺", "ゲート位置", "冷却回路"]) {
    assert.match(content, new RegExp(word));
  }
  assert.doesNotMatch(
    content,
    /A6061|アルミ|ステンレス|樹脂|\d+\s*(?:mm|℃|%|秒|MPa)/,
  );
  assert.ok(
    slide.dialogue
      .filter((message) => message.speaker === "expert")
      .every((message) => message.annotation === "デモ用の専門家回答"),
  );
});

test("Mergeした知見と既存ナレッジで足りる質問は、専門家なしで回答する（IDと本文を引用）", () => {
  for (const [index, base] of scenarios.entries()) {
    const followUp = followUpScenarios[index];
    const { item: k1, knowledge } = consultAndMerge(base, initialKnowledge);
    const { run, usage } = answerFollowUp(followUp, knowledge);
    assert.equal(run.status, "used", followUp.id);
    assert.equal(run.mode, "knowledge-only", followUp.id);
    assert.equal(run.cited?.id, k1.id);
    assert.ok(run.retrieval.results.some((result) => result.item.id === k1.id));
    assert.ok(run.scenario.gap.includes(k1.title));
    assert.ok(run.summary?.includes(k1.title));
    const savedText = [
      ...(k1.recommendations ?? []).map((r) => r.body),
      ...(k1.provenance?.dialogue ?? []).map((m) => m.text),
      k1.conditions ?? "",
      k1.summary,
    ];
    const sources = run.checks.flatMap((check) => check.sources);
    assert.ok(sources.length >= run.checks.length);
    assert.ok(sources.every((source) => source.kind !== "dialogue"), "no interview");
    for (const source of sources) {
      if (source.kind === "knowledge") {
        assert.equal(source.knowledgeId, k1.id);
        assert.ok(savedText.includes(source.quote), source.quote);
      } else if (source.kind === "document") {
        const note = run.retrieval.results.find((r) => r.item.id === source.knowledgeId)?.item;
        assert.ok(note && !note.isNew, `retrieved existing note ${source.knowledgeId}`);
        const noteText = [note.title, note.summary, ...(note.recommendations ?? []).map((r) => r.body)];
        assert.ok(noteText.includes(source.quote), source.quote);
      }
    }
    assert.deepEqual(usage?.usedKnowledge.map((item) => item.id), [k1.id]);
    assert.equal(usage?.mode, "knowledge-only");
  }
});

test("スライドの問いは、冷却回路のバランスを既存ナレッジ（seed-2-7）で補って回答する", () => {
  const { knowledge } = consultAndMerge(molding, initialKnowledge);
  const { run } = answerFollowUp(slide, knowledge);
  const cooling = run.checks.find((check) => check.id === "cooling")!;
  assert.deepEqual(
    cooling.sources.map((source) => source.kind === "document" && source.knowledgeId),
    ["seed-2-7"],
  );
  assert.ok(run.checks.filter((check) => check.id !== "cooling").every((check) => check.usesKnowledge));
});

test("登録知見と既存ナレッジで足りない論点があれば、専門家インタビューに進む", () => {
  const { knowledge } = consultAndMerge(molding, initialKnowledge);
  const harder = {
    ...slide,
    followUp: {
      ...slide.followUp!,
      reuse: [
        ...slide.followUp!.reuse,
        { id: "unknown", label: "未登録の論点", find: ["どこにも無い語"], appliedAs: "専門家に確認する。", answerIndex: 5 },
      ],
    },
  };
  const run = prepareRun({ query: harder.question, scenario: harder, knowledge });
  assert.equal(run.mode, "interview");
  assert.equal(run.status, "used");
  assert.ok(run.checks.some((check) => check.sources.some((source) => source.kind === "dialogue")));
});

test("第1サイクルの知見が未登録なら、使ったことにしない", () => {
  const { run, usage } = answerFollowUp(slide, initialKnowledge);
  assert.equal(run.status, "not-registered");
  assert.equal(run.mode, "interview");
  assert.equal(run.cited, undefined);
  assert.equal(usage, null);
  assert.ok(run.checks.every((check) => !check.usesKnowledge));
  assert.ok(
    run.checks.every((check) =>
      check.sources.every((source) => source.kind === "dialogue"),
    ),
  );
  assert.doesNotMatch(run.scenario.dialogue[0].text, /登録済み/);
});

test("別シナリオの登録知見は第2サイクルで使わない", () => {
  const { knowledge } = consultAndMerge(aluminum, initialKnowledge);
  const withWelding = consultAndMerge(welding, knowledge).knowledge;
  const { run, usage } = answerFollowUp(slide, withWelding);
  assert.equal(run.status, "not-registered");
  assert.equal(usage, null);
});

test("登録済みでも検索上位に入らなければ使わない", () => {
  const { item } = consultAndMerge(molding, initialKnowledge);
  const hidden: Knowledge = {
    ...item,
    title: "無関係なタイトル",
    tags: ["測定", "標準作業"],
  };
  const { run, usage } = answerFollowUp(slide, [hidden, ...initialKnowledge]);
  assert.equal(run.registered?.id, hidden.id);
  assert.equal(run.status, "not-retrieved");
  assert.equal(usage, null);
});

test("旧バージョンの保存データ（scenarioIdなし）はタグが完全一致した時だけ第1サイクル知見とみなす", () => {
  const { item } = consultAndMerge(molding, initialKnowledge);
  const legacy = { ...item, id: "legacy-1" } as Knowledge;
  delete legacy.scenarioId;
  assert.equal(cycleOneKnowledge([legacy], molding)?.id, "legacy-1");
  const partial = { ...legacy, tags: ["射出成形"] };
  assert.equal(cycleOneKnowledge([partial], molding), undefined);
});

test("第2サイクルの登録は第1サイクル知見を上書き・隠蔽しない", () => {
  const first = consultAndMerge(molding, initialKnowledge);
  const second = consultAndMerge(slide, first.knowledge);
  assert.notEqual(second.item.id, first.item.id);
  assert.equal(second.item.scenarioId, "molding-c2");
  assert.deepEqual(second.item.provenance?.basedOn, [
    { id: first.item.id, title: first.item.title },
  ]);
  assert.equal(cycleOneKnowledge(second.knowledge, molding)?.id, first.item.id);
  assert.ok(second.knowledge.some((item) => item.id === first.item.id));
  assert.equal(addKnowledgeOnce(second.knowledge, second.item), second.knowledge);
});

test("Mergeは確認チェック・Approve review・必須項目がそろった時だけ可能", () => {
  const ready = {
    ready: true,
    savedId: null,
    review: "approved" as const,
    checked: true,
    validDraft: true,
  };
  assert.equal(canMergeKnowledge(ready), true);
  assert.equal(canMergeKnowledge({ ...ready, review: "draft" }), false);
  assert.equal(canMergeKnowledge({ ...ready, review: "changes" }), false);
  assert.equal(canMergeKnowledge({ ...ready, checked: false }), false);
  assert.equal(canMergeKnowledge({ ...ready, validDraft: false }), false);
  assert.equal(canMergeKnowledge({ ...ready, savedId: "x" }), false);
  assert.equal(canMergeKnowledge({ ...ready, ready: false }), false);
});

test("回答の活用情報は、知見が消えた・別テーマの場合に使ったことにしない", () => {
  const first = consultAndMerge(molding, initialKnowledge);
  const { usage } = answerFollowUp(slide, first.knowledge);
  assert.ok(usage);
  assert.equal(latestUsageFor([usage], first.knowledge, molding)?.runId, usage.runId);
  assert.equal(latestUsageFor([usage], initialKnowledge, molding), undefined);
  assert.equal(latestUsageFor([usage], first.knowledge, aluminum), undefined);
});

test("同じ相談をもう一度すると、Mergeした知見だけで回答する（推奨・適用条件を本文のまま引用）", () => {
  for (const base of scenarios) {
    const { item: k1, knowledge } = consultAndMerge(base, initialKnowledge);
    const run = prepareRun({ query: base.question, scenario: base, knowledge });
    assert.equal(run.mode, "knowledge-only", base.id);
    assert.equal(run.match, "same");
    assert.equal(run.status, "used");
    assert.equal(run.cited?.id, k1.id);
    assert.ok(run.retrieval.results.some((result) => result.item.id === k1.id));
    assert.deepEqual(
      run.checks.map((check) => check.label),
      [...(k1.recommendations ?? []).map((item) => item.title), "適用条件の確認"],
    );
    const sources = run.checks.flatMap((check) => check.sources);
    assert.ok(sources.every((source) => source.kind === "knowledge" && source.knowledgeId === k1.id));
    const saved = [...(k1.recommendations ?? []).map((item) => item.body), k1.conditions];
    assert.ok(sources.every((source) => saved.includes(source.quote)));
    assert.ok(run.summary?.includes(k1.title) && run.summary.includes(k1.summary));
    assert.equal(answerBasis(run), "同じ相談の登録知見");
  }
});

test("関連する質問（量産時の注意点）も、その質問でMergeした知見があれば専門家なしで回答する", () => {
  const { item: k2, knowledge } = consultAndMerge(slide, initialKnowledge);
  assert.equal(k2.scenarioId, "molding-c2");
  for (const query of [slide.question, "この形状を量産するときの注意点は?"]) {
    const run = prepareRun({ query, scenario: matchScenario(query), knowledge });
    assert.equal(run.mode, "knowledge-only", query);
    assert.equal(run.match, "same");
    assert.equal(run.cited?.id, k2.id);
  }
  // 量産の知見は、元の相談（リブ裏のヒケ）の回答には使わない
  const base = prepareRun({ query: molding.question, scenario: molding, knowledge });
  assert.equal(base.mode, "interview");
  assert.equal(base.cited, undefined);
});

test("同じ相談を何度かMergeしていても、最新の知見が検索に入り、それを使う", () => {
  const { item } = consultAndMerge(molding, initialKnowledge);
  const copies: Knowledge[] = Array.from({ length: 7 }, (_, index) => ({
    ...item,
    // 新しいものほどIDの並びが後ろになるようにして、同点時の並びを確かめる
    id: `${index}0000000-0000-4000-8000-000000000000`,
    provenance: {
      ...item.provenance!,
      review: { ...item.provenance!.review, mergedAt: `2026-10-05T0${index}:00:00.000Z` },
    },
  }));
  const knowledge = [...copies].reverse().concat(initialKnowledge);
  const latest = copies[copies.length - 1];
  const run = prepareRun({ query: molding.question, scenario: molding, knowledge });
  assert.equal(run.retrieval.results[0].item.id, latest.id);
  assert.equal(run.mode, "knowledge-only");
  assert.equal(run.cited?.id, latest.id);
  const related = prepareRun({ query: slide.question, scenario: slide, knowledge });
  assert.equal(related.mode, "knowledge-only");
  assert.equal(related.cited?.id, latest.id);
});

test("同じ相談の知見があっても、検索で見つからなければ使ったことにしない", () => {
  const { item } = consultAndMerge(molding, initialKnowledge);
  const hidden: Knowledge = { ...item, title: "無関係なタイトル", summary: "無関係な要約", tags: ["測定", "標準作業"] };
  const run = prepareRun({ query: molding.question, scenario: molding, knowledge: [hidden, ...initialKnowledge] });
  assert.equal(run.mode, "interview");
  assert.equal(run.cited, undefined);
  assert.deepEqual(run.checks, []);
});

test("旧バージョンで保存した同じ相談の知見（scenarioIdなし）も、タグが完全一致すれば使う", () => {
  const { item } = consultAndMerge(molding, initialKnowledge);
  const legacy = { ...item, id: "legacy-1" } as Knowledge;
  delete legacy.scenarioId;
  const run = prepareRun({ query: molding.question, scenario: molding, knowledge: [legacy, ...initialKnowledge] });
  assert.equal(run.mode, "knowledge-only");
  assert.equal(run.cited?.id, "legacy-1");
});

test("登録知見がなければ、最初の相談はこれまで通り専門家インタビューで回答する", () => {
  const run = prepareRun({
    query: molding.question,
    scenario: molding,
    knowledge: initialKnowledge,
  });
  assert.equal(run.status, undefined);
  assert.deepEqual(run.checks, []);
  assert.equal(run.scenario, molding);
});

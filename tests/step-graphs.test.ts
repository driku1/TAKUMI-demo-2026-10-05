import assert from "node:assert/strict";
import test from "node:test";

import {
  followUpScenarios,
  initialKnowledge,
  scenarios,
  type Knowledge,
  type Scenario,
} from "../src/data.ts";
import { prepareRun } from "../src/knowledge-cycle.ts";
import {
  buildOntology,
  expectedKnowledgeProjection,
  placeEdgeLabels,
  questionPlanProjection,
  retrievalProjection,
  type OntologyNode,
  type OntologyProjection,
} from "../src/ontology.ts";
import { buildQuestions, recommendExperts } from "../src/process-model.ts";
import { consultAndMerge } from "./helpers.ts";

const allQuestions = [...scenarios, ...followUpScenarios];
const [, , molding] = scenarios;
const slide = followUpScenarios[2];

const overlap = (a: OntologyNode, b: OntologyNode, gap = 2) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap &&
  Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

/** Nodes never overlap and placed relation names stay off nodes and each other. */
function assertReadable(projection: OntologyProjection, label: string) {
  for (const [i, a] of projection.nodes.entries()) {
    for (const b of projection.nodes.slice(i + 1)) {
      assert.ok(!overlap(a, b), `${label}: ${a.id} x ${b.id}`);
    }
  }
  const ids = new Set(projection.nodes.map((item) => item.id));
  for (const item of projection.edges) {
    assert.ok(ids.has(item.source) && ids.has(item.target), `${label}: ${item.id}`);
    assert.ok(item.label.trim().length > 0);
    assert.doesNotMatch(item.label, /原因|影響|因果|引き起こ/, item.label);
  }
  const labels = placeEdgeLabels(projection.nodes, projection.edges);
  for (const [i, a] of labels.entries()) {
    for (const b of labels.slice(i + 1)) {
      assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
    }
  }
}

function snapshot(knowledge: Knowledge[], scenario: Scenario) {
  const view = buildOntology({ knowledge, scenario, stage: "after" });
  return {
    stored: JSON.stringify(knowledge),
    nodes: view.nodes.map((item) => item.id).join(","),
    edges: view.edges.map((item) => item.id).join(","),
  };
}

test("検索結果のグラフは検索結果の順に並び、順位・点数は出さず、承認済みグラフに何も追加しない", () => {
  const { knowledge } = consultAndMerge(molding, initialKnowledge);
  for (const scenario of allQuestions) {
    for (const input of [initialKnowledge, knowledge]) {
      const run = prepareRun({ query: scenario.question, scenario, knowledge: input });
      const before = snapshot(input, scenario);
      const projection = retrievalProjection({ knowledge: input, scenario, retrieval: run.retrieval });
      assert.deepEqual(snapshot(input, scenario), before, "the ontology is unchanged");
      const approved = new Set(buildOntology({ knowledge: input, scenario, stage: "after" }).nodes.map((item) => item.id));
      assert.ok(projection.nodes.every((item) => approved.has(item.id) && !item.hypothetical));
      const drawn = Object.keys(projection.hitNodeIds);
      assert.equal(drawn.length + projection.outside.length, run.retrieval.results.length);
      assert.deepEqual(projection.badges, {}, "no rank or score badges");
      const ys = run.retrieval.results
        .map((result) => projection.hitNodeIds[result.item.id])
        .filter(Boolean)
        .map((id) => projection.nodes.find((item) => item.id === id)!.y);
      assert.deepEqual(ys, [...ys].sort((a, b) => a - b), "top to bottom in search order");
      for (const result of run.retrieval.results) {
        const nodeId = projection.hitNodeIds[result.item.id];
        if (!nodeId) continue;
        for (const item of projection.edges.filter((edge) => edge.kind === "search" && edge.source === nodeId)) {
          const terms = item.label.replace("検索語一致：", "").split("・");
          assert.ok(terms.every((term) => result.matched.includes(term)), item.label);
        }
      }
      assert.ok(projection.edges.every((item) => item.kind !== "search" || item.label.startsWith("検索語一致：")));
      assertReadable(projection, `retrieval ${scenario.id}`);
    }
  }
});

test("同じ相談をもう一度すると、検索結果のグラフで登録知見が上位に表示される", () => {
  const { item, knowledge } = consultAndMerge(molding, initialKnowledge);
  const run = prepareRun({ query: molding.question, scenario: molding, knowledge });
  const projection = retrievalProjection({ knowledge, scenario: molding, retrieval: run.retrieval });
  assert.equal(projection.hitNodeIds[item.id], "knowledge-1");
  const notes = projection.nodes.filter((entry) => Object.values(projection.hitNodeIds).includes(entry.id));
  assert.equal(notes.sort((a, b) => a.y - b.y)[0].id, "knowledge-1", "shown at the top");
});

test("候補者ごとの想定グラフは、未登録の想定知見1件と（想定）の関係だけを一時的に加える", () => {
  for (const scenario of allQuestions) {
    const run = prepareRun({ query: scenario.question, scenario, knowledge: initialKnowledge });
    const candidates = recommendExperts(run.scenario, run.retrieval);
    assert.ok(candidates.length > 1);
    const before = snapshot(initialKnowledge, scenario);
    const shapes = new Set<string>();
    for (const candidate of candidates) {
      const projection = expectedKnowledgeProjection({ knowledge: initialKnowledge, scenario: run.scenario, candidate });
      const hypothetical = projection.nodes.filter((item) => item.hypothetical);
      assert.deepEqual(hypothetical.map((item) => item.id), [`expected-${candidate.expert.id}`]);
      const expected = projection.edges.filter((item) => item.kind === "expected");
      assert.ok(expected.length >= 2);
      assert.ok(expected.every((item) => item.label.endsWith("（想定）")));
      assert.ok(expected.some((item) => item.label === "対象部品（想定）"));
      assert.ok(expected.some((item) => item.label === "回答者（想定）" && item.target === hypothetical[0].id));
      // Notes linked as 参照候補 are retrieved notes the candidate wrote.
      for (const item of expected.filter((edge) => edge.label === "参照候補（想定）")) {
        const note = projection.nodes.find((entry) => entry.id === item.target)!;
        assert.ok(candidate.sources.some((source) => source.item.id === note.knowledgeId));
      }
      assert.equal(projection.connections.length, expected.length);
      shapes.add(expected.map((item) => item.target).sort().join(","));
      assertReadable(projection, `expected ${scenario.id} ${candidate.expert.name}`);
    }
    assert.ok(shapes.size > 1, `${scenario.id}: candidates differ`);
    assert.deepEqual(snapshot(initialKnowledge, scenario), before);
  }
});

test("質問計画のグラフは、参照した既存知見 → 確認したい点 → 生成した質問を一時表示する", () => {
  for (const scenario of allQuestions) {
    const run = prepareRun({ query: scenario.question, scenario, knowledge: initialKnowledge });
    const questions = buildQuestions(run.scenario);
    for (const count of [1, questions.length]) {
      const shown = questions.slice(0, count);
      const before = snapshot(initialKnowledge, scenario);
      const projection = questionPlanProjection({
        knowledge: initialKnowledge,
        scenario: run.scenario,
        retrieval: run.retrieval,
        questions: shown,
      });
      assert.deepEqual(snapshot(initialKnowledge, scenario), before);
      assert.equal(projection.rows.length, count);
      const [first, ...rest] = projection.rows;
      assert.equal(first.unknown, run.scenario.gap);
      assert.ok(first.notes.length > 0, `${scenario.id}: Q1 rests on retrieved knowledge`);
      for (const [index, row] of projection.rows.entries()) {
        const question = shown[index];
        assert.equal(row.question.id, question.id);
        assert.ok(projection.nodes.some((item) => item.id === `question-${question.id}` && item.hypothetical));
        assert.ok(projection.nodes.some((item) => item.id === `gap-${question.id}` && item.hypothetical));
        assert.ok(projection.edges.some((item) => item.source === `gap-${question.id}` && item.target === `question-${question.id}` && item.label === "質問を生成"));
        for (const note of row.notes) {
          const result = run.retrieval.results.find((entry) => entry.item.id === note.id);
          assert.ok(result, `${note.id} was retrieved`);
          assert.equal(note.summary, result.item.summary);
          assert.equal(note.rank, run.retrieval.results.indexOf(result) + 1);
        }
      }
      for (const [index, row] of rest.entries()) {
        assert.equal(row.unknown, shown[index + 1].purpose);
        assert.equal(row.answer?.text, shown[index + 1].trigger);
        assert.ok(run.scenario.dialogue.some((message) => message.speaker === "expert" && message.text === row.answer?.text));
      }
      // Only retrieved notes are highlighted; everything else drawn is temporary.
      const retrieved = new Set(run.retrieval.results.map((result) => result.item.id));
      for (const item of projection.nodes) {
        if (!item.hypothetical) assert.ok(item.knowledgeId && retrieved.has(item.knowledgeId), item.id);
      }
      assert.ok(projection.edges.every((item) => item.kind === "plan"));
      assertReadable(projection, `plan ${scenario.id} x${count}`);
    }
  }
});

test("スライドの問いの質問計画は、冷却回路と反りの既存知見から確認したい点と質問につながる", () => {
  const run = prepareRun({ query: slide.question, scenario: slide, knowledge: initialKnowledge });
  const questions = buildQuestions(run.scenario);
  const projection = questionPlanProjection({
    knowledge: initialKnowledge,
    scenario: run.scenario,
    retrieval: run.retrieval,
    questions,
  });
  const [q1, q2, q3] = projection.rows;
  assert.ok(q1.notes.some((note) => note.id === "seed-2-7"), "金型冷却回路の偏りを、成形品の反りと結びつける");
  assert.deepEqual(q1.topics, ["リブ周辺", "ゲート位置", "冷却回路"]);
  assert.match(q2.answer!.text, /冷却時の収縮差による反り/);
  assert.match(q2.question.text, /ゲート位置/);
  assert.match(q3.question.text, /冷却回路/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { followUpScenarios, initialKnowledge, scenarios } from "../src/data.ts";
import {
  WORLD,
  buildOntology,
  countSummary,
  egoLayout,
  fitText,
  placeEdgeLabels,
  textWidth,
  NODE_FONT,
  type OntologyNode,
  type OntologyStage,
} from "../src/ontology.ts";
import { answerFollowUp, consultAndMerge } from "./helpers.ts";

const stages: OntologyStage[] = ["before", "after", "focus", "usage"];
const [aluminum, , molding] = scenarios;
const slide = followUpScenarios[2];

function fullCycle() {
  const first = consultAndMerge(molding, initialKnowledge);
  const { usage } = answerFollowUp(slide, first.knowledge);
  const second = consultAndMerge(slide, first.knowledge);
  return { k1: first.item, k2: second.item, knowledge: second.knowledge, usage: usage! };
}

const overlap = (a: OntologyNode, b: OntologyNode, gap = 4) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap &&
  Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

test("登録前は既存の知識だけを表示し、保存データを変更しない", () => {
  const { knowledge, usage } = fullCycle();
  const snapshot = structuredClone(knowledge);
  const usageSnapshot = structuredClone(usage);
  const view = buildOntology({
    knowledge,
    usageRecords: [usage],
    scenario: molding,
    stage: "before",
  });
  const empty = buildOntology({
    knowledge: initialKnowledge,
    usageRecords: [],
    scenario: molding,
    stage: "before",
  });
  assert.deepEqual(knowledge, snapshot);
  assert.deepEqual(usage, usageSnapshot);
  assert.deepEqual(
    view.nodes.map((item) => item.id),
    empty.nodes.map((item) => item.id),
  );
  assert.equal(view.edges.length, empty.edges.length);
  assert.ok(view.nodes.every((item) => !item.phase));
  assert.deepEqual([view.newNodeIds, view.usedEdgeIds], [[], []]);
  // Going back to "after" shows the same saved note again.
  const after = buildOntology({
    knowledge,
    usageRecords: [usage],
    scenario: molding,
    stage: "after",
  });
  assert.equal(after.cycleOne?.id, snapshot[1].id);
});

test("追加後は第1サイクルの知見と自動で増えた関係をNEWとして示す", () => {
  const { k1, knowledge, usage } = fullCycle();
  const view = buildOntology({
    knowledge,
    usageRecords: [usage],
    scenario: molding,
    stage: "after",
  });
  const node = view.nodes.find((item) => item.id === "knowledge-1")!;
  assert.equal(node.knowledgeId, k1.id);
  assert.ok(view.newNodeIds.includes("knowledge-1"));
  assert.ok(!view.nodes.some((item) => item.id === "knowledge-2"));
  const labels = view.edges
    .filter((item) => view.newEdgeIds.includes(item.id))
    .map((item) => item.label);
  for (const label of ["承認（模擬）", "抽出元（対話）", "参照", "適用条件", "対象課題"]) {
    assert.ok(labels.includes(label), label);
  }
  const references = view.edges.filter(
    (item) => item.source === "knowledge-1" && item.label === "参照",
  );
  assert.deepEqual(
    references.map((item) => item.target.replace("doc-", "")).sort(),
    k1.provenance!.sourceIds.filter((id) => id !== k1.id).sort(),
  );
  assert.equal(view.usedEdgeIds.length, 0);
});

test("新知見に注目では全体を残したまま登録知見を選択する", () => {
  const { knowledge, usage } = fullCycle();
  const after = buildOntology({ knowledge, usageRecords: [usage], scenario: molding, stage: "after" });
  const focus = buildOntology({ knowledge, usageRecords: [usage], scenario: molding, stage: "focus" });
  assert.equal(focus.focusNodeId, "knowledge-1");
  assert.equal(focus.nodes.length, after.nodes.length);
  assert.equal(focus.edges.length, after.edges.length);
});

test("第2サイクルでの活用は、回答の参照元と同じ知見・関係だけをUSEDにする", () => {
  const { k1, k2, knowledge, usage } = fullCycle();
  const view = buildOntology({
    knowledge,
    usageRecords: [usage],
    scenario: molding,
    stage: "usage",
  });
  const usedKnowledge = view.nodes.find((item) => item.id === "knowledge-1")!;
  assert.deepEqual(
    usage.usedKnowledge.map((item) => item.id),
    [usedKnowledge.knowledgeId],
  );
  assert.equal(usedKnowledge.knowledgeId, k1.id);
  const used = view.edges.filter((item) => view.usedEdgeIds.includes(item.id));
  assert.ok(used.some((item) => item.id === "answer-2>knowledge-1" && item.label === "回答に使用"));
  assert.ok(used.some((item) => item.id === "consult-2>knowledge-1" && item.label === "検索でヒット"));
  const usedTopics = used
    .filter((item) => item.source === "answer-2" && item.target.startsWith("topic-"))
    .map((item) => item.target.replace("topic-molding-", ""))
    .sort();
  assert.deepEqual(
    usedTopics,
    usage.checks
      .filter((check) => check.usesKnowledge && check.topic)
      .map((check) => check.topic!)
      .sort(),
  );
  const answer = view.nodes.find((item) => item.id === "answer-2")!;
  assert.deepEqual(
    answer.facts.map((fact) => fact.label),
    usage.checks.map((check) => check.label),
  );
  // NEW (added) and USED (used now) never overlap.
  assert.equal(
    view.newEdgeIds.filter((id) => view.usedEdgeIds.includes(id)).length,
    0,
  );
  assert.ok(!view.newNodeIds.includes("knowledge-1"));
  assert.ok(view.newNodeIds.includes("knowledge-2"));
  assert.ok(
    view.edges.some(
      (item) => item.id === "knowledge-2>knowledge-1" && item.label === "発展元",
    ),
  );
  assert.equal(view.cycleTwo?.id, k2.id);
});

test("活用記録の知見が消えていれば、使用関係を表示しない", () => {
  const { k1, knowledge, usage } = fullCycle();
  const withoutK1 = knowledge.filter((item) => item.id !== k1.id);
  const view = buildOntology({
    knowledge: withoutK1,
    usageRecords: [usage],
    scenario: molding,
    stage: "usage",
  });
  assert.equal(view.usage, undefined);
  assert.equal(view.usedEdgeIds.length, 0);
  assert.ok(!view.nodes.some((item) => item.id === "answer-2"));
  assert.equal(view.availability.after, false);
});

test("他テーマのタブには、そのテーマの登録知見と活用だけを表示する", () => {
  const { knowledge, usage } = fullCycle();
  const view = buildOntology({
    knowledge,
    usageRecords: [usage],
    scenario: aluminum,
    stage: "usage",
  });
  assert.equal(view.stage, "before");
  assert.deepEqual(view.availability, {
    before: true,
    after: false,
    focus: false,
    usage: false,
  });
  assert.ok(view.nodes.every((item) => !item.phase));
});

test("関係には意味のある名称があり、タグ一致や参照を因果として扱わない", () => {
  const { knowledge, usage } = fullCycle();
  const view = buildOntology({ knowledge, usageRecords: [usage], scenario: molding, stage: "usage" });
  const ids = new Set(view.nodes.map((item) => item.id));
  const edgeIds = new Set<string>();
  for (const item of view.edges) {
    assert.ok(item.label.trim().length > 0);
    assert.ok(ids.has(item.source) && ids.has(item.target), item.id);
    assert.ok(!edgeIds.has(item.id), `duplicate ${item.id}`);
    edgeIds.add(item.id);
    assert.doesNotMatch(item.label, /原因|影響|起因|要因/);
    if (item.kind === "tag") assert.match(item.label, /^(タグ一致|本文で言及)：/);
    if (item.kind === "reference") assert.match(item.label, /^(参照|抽出元|発展元)/);
  }
  const allKinds = new Set(view.edges.map((item) => item.kind));
  assert.ok(!allKinds.has("cause" as never));
});

test("件数表示はノード・関係の実数と一致する", () => {
  const { knowledge, usage } = fullCycle();
  for (const stage of stages) {
    const view = buildOntology({ knowledge, usageRecords: [usage], scenario: molding, stage });
    const counts = countSummary(view);
    assert.equal(counts.nodes, view.nodes.length);
    assert.equal(counts.links, view.edges.length);
    assert.equal(counts.newNodes, view.newNodeIds.length);
    assert.equal(counts.usedLinks, view.usedEdgeIds.length);
  }
});

test("全テーマ・全段階でノードが重ならず、名称・関係名が重ならない", () => {
  let knowledge = initialKnowledge;
  const usageRecords = [];
  for (const [index, base] of scenarios.entries()) {
    knowledge = consultAndMerge(base, knowledge).knowledge;
    const { usage } = answerFollowUp(followUpScenarios[index], knowledge);
    usageRecords.unshift(usage!);
    knowledge = consultAndMerge(followUpScenarios[index], knowledge).knowledge;
  }
  for (const scenario of scenarios) {
    for (const stage of stages) {
      const view = buildOntology({ knowledge, usageRecords, scenario, stage });
      assert.equal(view.stage, stage, `${scenario.id} ${stage}`);
      for (const [i, a] of view.nodes.entries()) {
        assert.ok(a.x - a.w / 2 >= 0 && a.x + a.w / 2 <= WORLD.width, a.id);
        assert.ok(a.y - a.h / 2 >= 0 && a.y + a.h / 2 <= WORLD.height, a.id);
        for (const b of view.nodes.slice(i + 1)) {
          assert.ok(!overlap(a, b), `${scenario.id}/${stage}: ${a.id} x ${b.id}`);
        }
        const shown = fitText(a.label, a.w - 14, NODE_FONT.title);
        assert.ok(textWidth(shown, NODE_FONT.title) <= a.w - 14 + NODE_FONT.title);
      }
      const labels = placeEdgeLabels(view.nodes, view.edges);
      for (const [i, a] of labels.entries()) {
        for (const b of labels.slice(i + 1)) {
          const hit =
            a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          assert.ok(!hit, `${a.text} x ${b.text}`);
        }
        for (const item of view.nodes) {
          const hit =
            a.x < item.x + item.w / 2 &&
            item.x - item.w / 2 < a.x + a.w &&
            a.y < item.y + item.h / 2 &&
            item.y - item.h / 2 < a.y + a.h;
          assert.ok(!hit, `label ${a.text} on node ${item.id}`);
        }
      }
      // Every emphasised relation gets a readable label on the canvas.
      const emphasised = view.edges.filter(
        (item) => view.usedEdgeIds.includes(item.id) || view.newEdgeIds.includes(item.id),
      );
      const placed = placeEdgeLabels(view.nodes, emphasised);
      assert.equal(
        placed.length,
        emphasised.length,
        `${scenario.id}/${stage}: ${placed.length}/${emphasised.length} labels`,
      );
    }
  }
});

test("Merge後の補助グラフは同じノードと関係を、知見を中心に重ならず配置する", () => {
  const { knowledge, usage } = fullCycle();
  for (const [stage, focusId] of [
    ["focus", "knowledge-1"],
    ["usage", "knowledge-2"],
  ] as const) {
    const view = buildOntology({ knowledge, usageRecords: [usage], scenario: molding, stage });
    const ego = egoLayout(view, focusId, stage === "usage" ? view.usedNodeIds : []);
    const viewEdges = new Set(view.edges.map((item) => item.id));
    assert.ok(ego.edges.every((item) => viewEdges.has(item.id)));
    const connected = view.edges.filter(
      (item) => item.source === focusId || item.target === focusId,
    );
    assert.ok(connected.every((item) => ego.edges.includes(item)));
    for (const [i, a] of ego.nodes.entries()) {
      for (const b of ego.nodes.slice(i + 1)) {
        assert.ok(!overlap(a, b), `${a.id} x ${b.id}`);
      }
    }
  }
});

test("グラフ外の出典は線にせず、存在しない出典へ接続しない", () => {
  const first = consultAndMerge(molding, initialKnowledge);
  const broken = {
    ...first.item,
    provenance: {
      ...first.item.provenance!,
      sourceIds: [...first.item.provenance!.sourceIds, "missing-note"],
    },
  };
  const view = buildOntology({
    knowledge: [broken, ...initialKnowledge],
    usageRecords: [],
    scenario: molding,
    stage: "after",
  });
  assert.ok(view.hiddenSources.includes("missing-note"));
  assert.ok(!view.edges.some((item) => item.target === "doc-missing-note"));
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { followUpScenarios, initialKnowledge, scenarios } from "../src/data.ts";
import {
  WORLD,
  buildOntology,
  countSummary,
  egoLayout,
  fitText,
  placeEdgeLabels,
  labelPriority,
  KEY_RELATIONS,
  textWidth,
  NODE_FONT,
  type OntologyNode,
  type OntologyStage,
} from "../src/ontology.ts";
import { buildUsageRecord, prepareRun } from "../src/knowledge-cycle.ts";
import { answerFollowUp, consultAndMerge } from "./helpers.ts";

const stages: OntologyStage[] = ["before", "after", "focus", "usage"];
const [aluminum, , molding] = scenarios;
const slide = followUpScenarios[2];
const approvedKinds = new Set([
  "company",
  "division",
  "department",
  "team",
  "person",
  "root",
  "domain",
  "part",
  "topic",
  "document",
  "knowledge",
]);

/** First consultation merged, then a related question answered (not merged). */
function answered() {
  const first = consultAndMerge(molding, initialKnowledge);
  const { usage } = answerFollowUp(slide, first.knowledge);
  return { k1: first.item, knowledge: first.knowledge, usage: usage! };
}

const overlap = (a: OntologyNode, b: OntologyNode, gap = 4) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap &&
  Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

test("グラフには承認済みのものだけが入り、相談・回答・条件の点はない", () => {
  const { knowledge, usage } = answered();
  for (const stage of stages) {
    const view = buildOntology({ knowledge, overlay: usage, scenario: molding, stage });
    for (const item of view.nodes) assert.ok(approvedKinds.has(item.kind), item.id);
    for (const item of view.nodes.filter((entry) => entry.kind === "knowledge")) {
      const saved = knowledge.find((entry) => entry.id === item.knowledgeId)!;
      assert.equal(saved.provenance?.review.simulated, true);
      assert.ok(saved.provenance?.review.mergedAt);
    }
  }
});

test("登録前は既存の知識だけを表示し、保存データを変更しない", () => {
  const { knowledge, usage } = answered();
  const snapshot = structuredClone(knowledge);
  const view = buildOntology({ knowledge, overlay: usage, scenario: molding, stage: "before" });
  const empty = buildOntology({ knowledge: initialKnowledge, scenario: molding, stage: "before" });
  assert.deepEqual(knowledge, snapshot);
  assert.deepEqual(view.nodes.map((item) => item.id), empty.nodes.map((item) => item.id));
  assert.equal(view.edges.length, empty.edges.length);
  assert.deepEqual([view.newNodeIds, view.usedEdgeIds, view.overlayEdges], [[], [], []]);
  const after = buildOntology({ knowledge, scenario: molding, stage: "after" });
  assert.equal(after.registered[0].id, snapshot[0].id);
});

test("追加後はMergeした知見と自動で増えた関係をNEWとして示す", () => {
  const { k1, knowledge } = answered();
  const view = buildOntology({ knowledge, scenario: molding, stage: "after" });
  const node = view.nodes.find((item) => item.id === "knowledge-1")!;
  assert.equal(node.knowledgeId, k1.id);
  assert.deepEqual(view.newNodeIds, ["knowledge-1"]);
  assert.ok(node.facts.some((fact) => fact.label === "適用条件" && fact.value === k1.conditions));
  const labels = view.edges
    .filter((item) => view.newEdgeIds.includes(item.id))
    .map((item) => item.label);
  for (const label of ["承認（模擬）", "参照"]) assert.ok(labels.includes(label), label);
  const references = view.edges.filter(
    (item) => item.source === "knowledge-1" && item.label === "参照",
  );
  assert.deepEqual(
    references.map((item) => item.target.replace("doc-", "")).sort(),
    k1.provenance!.sourceIds.sort(),
  );
});

test("回答の重ね表示（④）は点も線も追加せず、回答の参照元と同じ知見を強調する", () => {
  const { k1, knowledge, usage } = answered();
  const after = buildOntology({ knowledge, scenario: molding, stage: "after" });
  const view = buildOntology({ knowledge, overlay: usage, scenario: molding, stage: "usage" });
  assert.equal(view.stage, "usage");
  assert.deepEqual(view.nodes.map((item) => item.id), after.nodes.map((item) => item.id));
  assert.deepEqual(view.edges.map((item) => item.id), after.edges.map((item) => item.id));
  assert.equal(countSummary(view).nodes, countSummary(after).nodes);
  assert.equal(countSummary(view).links, countSummary(after).links);
  assert.deepEqual(view.newNodeIds, []);
  const used = view.nodes.find((item) => item.id === "knowledge-1")!;
  assert.deepEqual(usage.usedKnowledge.map((item) => item.id), [used.knowledgeId]);
  assert.equal(used.knowledgeId, k1.id);
  const usedTopics = view.usedNodeIds
    .filter((id) => id.startsWith("topic-"))
    .map((id) => id.replace("topic-molding-", ""))
    .sort();
  assert.deepEqual(
    usedTopics,
    usage.checks
      .filter((check) => check.topic && check.sources.some((source) => source.kind !== "dialogue"))
      .map((check) => check.topic!)
      .sort(),
  );
  // The existing note the answer cited is highlighted too.
  assert.ok(view.usedNodeIds.includes("doc-seed-2-7"));
  for (const item of view.overlayEdges) {
    assert.ok(view.usedNodeIds.includes(item.source));
    assert.ok(view.usedNodeIds.includes(item.target));
    assert.ok(!view.edges.some((edge) => edge.id === item.id));
  }
  assert.ok(view.overlayEdges.some((item) => item.label === "回答で使用"));
});

test("同じ相談をもう一度した回答も④で示し、使った知見だけを強調する", () => {
  const first = consultAndMerge(molding, initialKnowledge);
  const run = prepareRun({ query: molding.question, scenario: molding, knowledge: first.knowledge });
  const usage = buildUsageRecord(run, { runId: "again", question: molding.question })!;
  assert.equal(usage.scenarioId, "molding");
  const after = buildOntology({ knowledge: first.knowledge, scenario: molding, stage: "after" });
  const view = buildOntology({ knowledge: first.knowledge, overlay: usage, scenario: molding, stage: "usage" });
  assert.equal(view.stage, "usage");
  assert.deepEqual(view.nodes.map((item) => item.id), after.nodes.map((item) => item.id));
  assert.deepEqual(view.edges.map((item) => item.id), after.edges.map((item) => item.id));
  assert.equal(view.focusNodeId, "knowledge-1");
  assert.deepEqual(view.usedNodeIds, ["knowledge-1"]);
  assert.deepEqual(view.overlayEdges, []);

  // 関連する質問を先にMergeして、同じ質問をもう一度した場合は knowledge-2 を使う
  const related = consultAndMerge(slide, initialKnowledge);
  const again = prepareRun({ query: slide.question, scenario: slide, knowledge: related.knowledge });
  const usage2 = buildUsageRecord(again, { runId: "again-2", question: slide.question })!;
  const view2 = buildOntology({ knowledge: related.knowledge, overlay: usage2, scenario: molding, stage: "usage" });
  assert.equal(view2.stage, "usage");
  assert.equal(view2.focusNodeId, "knowledge-2");
  assert.deepEqual(view2.usedNodeIds, ["knowledge-2"]);
});

test("回答の知見が消えている・別テーマ・回答なしなら④を出さない", () => {
  const { k1, knowledge, usage } = answered();
  const without = knowledge.filter((item) => item.id !== k1.id);
  for (const [input, scenario, overlay] of [
    [without, molding, usage],
    [knowledge, aluminum, usage],
    [knowledge, molding, null],
  ] as const) {
    const view = buildOntology({ knowledge: [...input], overlay, scenario, stage: "usage" });
    assert.notEqual(view.stage, "usage");
    assert.equal(view.availability.usage, false);
    assert.deepEqual([view.usedNodeIds, view.overlayEdges], [[], []]);
  }
});

test("次の相談でMergeした知見も承認済みとして追加され、元の知見を残して発展元でつながる", () => {
  const first = consultAndMerge(molding, initialKnowledge);
  const second = consultAndMerge(slide, first.knowledge);
  const view = buildOntology({ knowledge: second.knowledge, scenario: molding, stage: "after" });
  const ids = view.nodes.filter((item) => item.kind === "knowledge").map((item) => item.knowledgeId);
  assert.deepEqual(ids, [first.item.id, second.item.id]);
  assert.ok(view.edges.some((item) => item.id === "knowledge-2>knowledge-1" && item.label === "発展元"));
  const focus = buildOntology({ knowledge: second.knowledge, scenario: molding, stage: "focus" });
  assert.ok(["knowledge-1", "knowledge-2"].includes(focus.focusNodeId!));
});

test("他テーマのタブには、そのテーマの登録知見だけを表示する", () => {
  const { knowledge, usage } = answered();
  const view = buildOntology({ knowledge, overlay: usage, scenario: aluminum, stage: "usage" });
  assert.equal(view.stage, "before");
  assert.deepEqual(view.availability, { before: true, after: false, focus: false, usage: false });
  assert.ok(view.nodes.every((item) => item.kind !== "knowledge"));
});

test("関係には意味のある名称があり、タグ一致や参照を因果として扱わない", () => {
  const { knowledge, usage } = answered();
  const view = buildOntology({ knowledge, overlay: usage, scenario: molding, stage: "usage" });
  const ids = new Set(view.nodes.map((item) => item.id));
  const edgeIds = new Set<string>();
  for (const item of [...view.edges, ...view.overlayEdges]) {
    assert.ok(item.label.trim().length > 0);
    assert.ok(ids.has(item.source) && ids.has(item.target), item.id);
    assert.ok(!edgeIds.has(item.id), `duplicate ${item.id}`);
    edgeIds.add(item.id);
    assert.doesNotMatch(item.label, /原因|影響|起因|要因/);
    if (item.kind === "tag") assert.match(item.label, /^(タグ一致|本文で言及)：/);
    if (item.kind === "reference") assert.match(item.label, /^(参照|発展元)/);
  }
});

test("件数表示はノード・関係の実数と一致する", () => {
  const { knowledge, usage } = answered();
  for (const stage of stages) {
    const view = buildOntology({ knowledge, overlay: usage, scenario: molding, stage });
    const counts = countSummary(view);
    assert.equal(counts.nodes, view.nodes.length);
    assert.equal(counts.links, view.edges.length);
    assert.equal(counts.newNodes, view.newNodeIds.length);
    assert.equal(counts.usedLinks, view.usedEdgeIds.length);
  }
});

test("全テーマ・全段階でノードが重ならず、名称・関係名が重ならない", () => {
  let knowledge = initialKnowledge;
  const overlays = [];
  for (const [index, base] of scenarios.entries()) {
    knowledge = consultAndMerge(base, knowledge).knowledge;
    overlays.push(answerFollowUp(followUpScenarios[index], knowledge).usage!);
    knowledge = consultAndMerge(followUpScenarios[index], knowledge).knowledge;
  }
  for (const [index, scenario] of scenarios.entries()) {
    for (const stage of stages) {
      const view = buildOntology({ knowledge, overlay: overlays[index], scenario, stage });
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
      const drawn = [...view.edges, ...view.overlayEdges];
      const labels = placeEdgeLabels(view.nodes, drawn);
      for (const [i, a] of labels.entries()) {
        for (const b of labels.slice(i + 1)) {
          const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
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
      // Answer usage and key relation names are always readable; repeated
      // 参照 / タグ一致 labels may give way (they stay listed in the detail panel).
      const emphasised = drawn.filter(
        (item) => view.usedEdgeIds.includes(item.id) || view.newEdgeIds.includes(item.id),
      );
      const placed = new Set(
        placeEdgeLabels(view.nodes, emphasised, undefined, labelPriority(view)).map(
          (label) => label.edgeId,
        ),
      );
      for (const item of emphasised) {
        if (view.usedEdgeIds.includes(item.id) || KEY_RELATIONS.includes(item.label)) {
          assert.ok(placed.has(item.id), `${scenario.id}/${stage}: ${item.label}`);
        }
      }
      assert.ok(
        placed.size >= emphasised.length * 0.7,
        `${scenario.id}/${stage}: ${placed.size}/${emphasised.length} labels`,
      );
    }
  }
});

test("Merge後と回答の補助グラフは同じノード・関係を、知見を中心に重ならず配置する", () => {
  const { knowledge, usage } = answered();
  for (const stage of ["focus", "usage"] as const) {
    const view = buildOntology({ knowledge, overlay: usage, scenario: molding, stage });
    const full = { nodes: view.nodes, edges: [...view.edges, ...view.overlayEdges] };
    const ego = egoLayout(full, "knowledge-1", view.usedNodeIds);
    const ids = new Set(full.edges.map((item) => item.id));
    assert.ok(ego.edges.every((item) => ids.has(item.id)));
    for (const [i, a] of ego.nodes.entries()) {
      for (const b of ego.nodes.slice(i + 1)) assert.ok(!overlap(a, b), `${a.id} x ${b.id}`);
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
  const view = buildOntology({ knowledge: [broken, ...initialKnowledge], scenario: molding, stage: "after" });
  assert.ok(view.hiddenSources.includes("missing-note"));
  assert.ok(!view.edges.some((item) => item.target === "doc-missing-note"));
});

test("ナレッジグラフの中には顔（似顔絵）を描かない（似顔絵は匠の選定の候補者パネルだけ）", () => {
  const graph = readFileSync(new URL("../src/OntologyGraph.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(graph, /Portrait/);
  const users = ["App.tsx", "ProcessWorkspace.tsx", "StepGraphs.tsx"].filter((file) =>
    readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8").includes("<Portrait"),
  );
  assert.deepEqual(users, ["StepGraphs.tsx"], "only the candidate panel draws portraits");
  const panel = readFileSync(new URL("../src/StepGraphs.tsx", import.meta.url), "utf8");
  const face = panel.indexOf("<Portrait");
  assert.ok(panel.lastIndexOf('className="candidate-face"', face) > panel.lastIndexOf("<OntologyGraph", face));
});

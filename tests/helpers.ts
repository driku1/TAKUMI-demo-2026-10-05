import {
  experts,
  initialKnowledge,
  type Knowledge,
  type Scenario,
} from "../src/data.ts";
import {
  buildMergedKnowledge,
  buildUsageRecord,
  prepareRun,
  type KnowledgeUsage,
} from "../src/knowledge-cycle.ts";

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}${String(++counter).padStart(7, "0")}-0000-4000-8000-000000000000`;

/** Runs one consultation and merges it the way the Knowledge PR does after approval. */
export function consultAndMerge(
  scenario: Scenario,
  knowledge: Knowledge[],
  now = new Date("2026-10-05T01:00:00Z"),
) {
  const run = prepareRun({ query: scenario.question, scenario, knowledge });
  const expert = experts.find((item) => item.id === scenario.expertId)!;
  const item = buildMergedKnowledge({
    id: nextId(scenario.followUp ? "c2" : "c1"),
    draft: {
      title: run.scenario.title,
      summary: run.scenario.insight,
      conditions: run.scenario.conditions,
    },
    scenario: run.scenario,
    expert,
    question: scenario.question,
    sourceIds: run.retrieval.results.map((result) => result.item.id),
    extraDialogue: [],
    reviewComment: "確認済み（テスト）",
    basedOn: run.cited,
    now,
  });
  return { run, item, knowledge: [item, ...knowledge] };
}

export function answerFollowUp(
  followUp: Scenario,
  knowledge: Knowledge[],
  runId = nextId("run"),
): { run: ReturnType<typeof prepareRun>; usage: KnowledgeUsage | null } {
  const run = prepareRun({
    query: followUp.question,
    scenario: followUp,
    knowledge,
  });
  return {
    run,
    usage: buildUsageRecord(run, {
      runId,
      question: followUp.question,
      now: new Date("2026-10-05T02:00:00Z"),
    }),
  };
}

export { initialKnowledge };

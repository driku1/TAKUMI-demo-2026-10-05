import {
  baseScenarioOf,
  followUpScenarios,
  scenarios,
  type BaseScenarioId,
  type Expert,
  type FollowUpScenarioId,
  type Knowledge,
  type Scenario,
  type ScenarioId,
} from "./data.ts";
import { retrieveKnowledge } from "./process-model.ts";

export const KNOWLEDGE_STORAGE_KEY = "takumi-knowledge";
export const USAGE_STORAGE_KEY = "takumi-knowledge-usage";
const USAGE_LIMIT = 50;

export const shortId = (id: string) => id.slice(0, 8);

/**
 * Latest first-cycle knowledge registered for a base scenario.
 * Notes saved by older versions carry no scenarioId; they count only when their
 * tags are exactly the scenario's tags (that is how those versions saved them).
 * Second-cycle notes never match, so a second registration cannot hide the first.
 */
export function cycleOneKnowledge(
  knowledge: Knowledge[],
  base: Scenario,
): Knowledge | undefined {
  return knowledge.find((item) => {
    if (!item.isNew) return false;
    if (item.scenarioId) return item.scenarioId === base.id;
    return (
      item.tags.length === base.tags.length &&
      item.tags.every((tag) => base.tags.includes(tag))
    );
  });
}

/** Latest knowledge registered from a second-cycle consultation. */
export function cycleTwoKnowledge(
  knowledge: Knowledge[],
  followUp: Scenario,
): Knowledge | undefined {
  return knowledge.find(
    (item) => item.isNew && item.scenarioId === followUp.id,
  );
}

export type ReuseSource =
  | {
      kind: "knowledge";
      knowledgeId: string;
      knowledgeTitle: string;
      location: string;
      quote: string;
    }
  | { kind: "dialogue"; answerIndex: number; label: string; quote: string };

export type ReuseCheck = {
  id: string;
  label: string;
  topic?: string;
  appliedAs: string;
  sources: ReuseSource[];
  usesKnowledge: boolean;
};

export type CycleTwoStatus = "used" | "not-registered" | "not-retrieved";

export type RunContext = {
  /** Scenario with second-cycle texts resolved against the registered knowledge. */
  scenario: Scenario;
  retrieval: ReturnType<typeof retrieveKnowledge>;
  /** First-cycle knowledge that was registered, retrieved and cited. */
  cycleOne?: Knowledge;
  /** Registered first-cycle knowledge, even when it was not retrieved. */
  registered?: Knowledge;
  status?: CycleTwoStatus;
  checks: ReuseCheck[];
};

/** Finds the first passage of saved knowledge that contains one of the keywords. */
export function findPassage(
  item: Knowledge,
  keywords: string[],
): { location: string; quote: string } | undefined {
  const hit = (text: string) => keywords.some((word) => text.includes(word));
  const recommendations = item.recommendations ?? [];
  for (const [index, recommendation] of recommendations.entries()) {
    if (hit(`${recommendation.title} ${recommendation.body}`)) {
      return {
        location: `推奨${index + 1}「${recommendation.title}」`,
        quote: recommendation.body,
      };
    }
  }
  let answer = 0;
  for (const message of item.provenance?.dialogue ?? []) {
    if (message.speaker !== "expert") continue;
    answer += 1;
    if (hit(message.text)) {
      return { location: `対話記録 A${answer}`, quote: message.text };
    }
  }
  if (item.conditions && hit(item.conditions)) {
    return { location: "適用条件", quote: item.conditions };
  }
  if (hit(item.summary)) return { location: "要約", quote: item.summary };
  return undefined;
}

function answerLabel(scenario: Scenario, answerIndex: number) {
  const number = scenario.dialogue
    .slice(0, answerIndex + 1)
    .filter((message) => message.speaker === "expert").length;
  return `今回の対話 A${number}`;
}

function buildChecks(scenario: Scenario, cycleOne?: Knowledge): ReuseCheck[] {
  const plan = scenario.followUp;
  if (!plan) return [];
  const checks = plan.reuse.map((rule) => {
    const passage = cycleOne ? findPassage(cycleOne, rule.find) : undefined;
    const sources: ReuseSource[] = [];
    if (cycleOne && passage) {
      sources.push({
        kind: "knowledge",
        knowledgeId: cycleOne.id,
        knowledgeTitle: cycleOne.title,
        ...passage,
      });
    }
    const answer =
      rule.answerIndex === undefined
        ? undefined
        : scenario.dialogue[rule.answerIndex];
    if (answer?.speaker === "expert" && rule.answerIndex !== undefined) {
      sources.push({
        kind: "dialogue",
        answerIndex: rule.answerIndex,
        label: answerLabel(scenario, rule.answerIndex),
        quote: answer.text,
      });
    }
    return {
      id: rule.id,
      label: rule.label,
      topic: rule.topic,
      appliedAs: rule.appliedAs,
      sources,
      usesKnowledge: sources.some((source) => source.kind === "knowledge"),
    };
  });
  if (cycleOne?.conditions) {
    checks.push({
      id: "conditions",
      label: "適用条件の確認",
      topic: undefined,
      appliedAs:
        "今回の相談が、登録時の適用条件の範囲内かを担当の匠が確認する。",
      sources: [
        {
          kind: "knowledge",
          knowledgeId: cycleOne.id,
          knowledgeTitle: cycleOne.title,
          location: "適用条件",
          quote: cycleOne.conditions,
        },
      ],
      usesKnowledge: true,
    });
  }
  return checks.filter((check) => check.sources.length > 0);
}

function resolveFollowUp(
  scenario: Scenario,
  cycleOne: Knowledge | undefined,
  checks: ReuseCheck[],
): Scenario {
  const plan = scenario.followUp;
  if (!plan || !cycleOne) return scenario;
  const fill = (text: string) =>
    text
      .replaceAll("{title}", cycleOne.title)
      .replaceAll("{id}", shortId(cycleOne.id));
  const covered = checks
    .filter((check) => check.usesKnowledge && check.id !== "conditions")
    .map((check) => check.label);
  return {
    ...scenario,
    gap: `登録知見「${cycleOne.title}」（${shortId(cycleOne.id)}）に、${covered.join("・")}の確認内容があります。${plan.remainingGap}`,
    dialogue: scenario.dialogue.map((message, index) =>
      index === 0
        ? {
            ...message,
            text: fill(plan.questionWithKnowledge),
            annotation: plan.annotationWithKnowledge,
          }
        : message,
    ),
  };
}

/**
 * Prepares one consultation run. For a second-cycle consultation the
 * first-cycle knowledge is cited only when it is registered, retrieved by this
 * run's search and contains a matching passage.
 */
export function prepareRun({
  query,
  scenario,
  knowledge,
}: {
  query: string;
  scenario: Scenario;
  knowledge: Knowledge[];
}): RunContext {
  const retrieval = retrieveKnowledge(query, scenario, knowledge);
  if (!scenario.followUp) return { scenario, retrieval, checks: [] };
  const registered = cycleOneKnowledge(knowledge, baseScenarioOf(scenario));
  const retrieved = Boolean(
    registered &&
      retrieval.results.some((result) => result.item.id === registered.id),
  );
  const candidate = retrieved ? registered : undefined;
  const candidateChecks = buildChecks(scenario, candidate);
  const cycleOne = candidateChecks.some((check) => check.usesKnowledge)
    ? candidate
    : undefined;
  const checks = cycleOne ? candidateChecks : buildChecks(scenario);
  return {
    scenario: resolveFollowUp(scenario, cycleOne, checks),
    retrieval,
    cycleOne,
    registered,
    status: cycleOne
      ? "used"
      : registered
        ? "not-retrieved"
        : "not-registered",
    checks,
  };
}

export type UsedKnowledge = {
  id: string;
  title: string;
  author: string;
  reviewer?: string;
  mergedAt?: string;
};

/** Record of a second-cycle answer that cited first-cycle knowledge. */
export type KnowledgeUsage = {
  runId: string;
  scenarioId: FollowUpScenarioId;
  baseScenarioId: BaseScenarioId;
  question: string;
  answeredAt: string;
  usedKnowledge: UsedKnowledge[];
  checks: ReuseCheck[];
};

export function buildUsageRecord(
  run: RunContext,
  { runId, question, now = new Date() }: { runId: string; question: string; now?: Date },
): KnowledgeUsage | null {
  const plan = run.scenario.followUp;
  if (!plan || !run.cycleOne) return null;
  const item = run.cycleOne;
  return {
    runId,
    scenarioId: run.scenario.id as FollowUpScenarioId,
    baseScenarioId: plan.baseScenarioId,
    question,
    answeredAt: now.toISOString(),
    usedKnowledge: [
      {
        id: item.id,
        title: item.title,
        author: item.author,
        reviewer: item.provenance?.review.reviewer,
        mergedAt: item.provenance?.review.mergedAt,
      },
    ],
    checks: run.checks.map((check) => ({
      ...check,
      sources: check.sources.map((source) => ({ ...source })),
    })),
  };
}

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

function isUsage(value: unknown): value is KnowledgeUsage {
  const record = value as KnowledgeUsage;
  return (
    Boolean(record) &&
    isText(record.runId) &&
    followUpScenarios.some((item) => item.id === record.scenarioId) &&
    scenarios.some((item) => item.id === record.baseScenarioId) &&
    isText(record.question) &&
    isText(record.answeredAt) &&
    Array.isArray(record.usedKnowledge) &&
    record.usedKnowledge.length > 0 &&
    record.usedKnowledge.every((item) => isText(item?.id) && isText(item?.title)) &&
    Array.isArray(record.checks) &&
    record.checks.every(
      (check) =>
        isText(check?.id) &&
        isText(check?.label) &&
        Array.isArray(check?.sources) &&
        check.sources.every(
          (source) =>
            (source?.kind === "knowledge" && isText(source.knowledgeId)) ||
            source?.kind === "dialogue",
        ),
    )
  );
}

/** Parses stored usage records, skipping anything malformed. */
export function parseUsageRecords(raw: unknown): KnowledgeUsage[] {
  return Array.isArray(raw) ? raw.filter(isUsage) : [];
}

export function readStoredUsage(storage: Pick<Storage, "getItem">) {
  try {
    return parseUsageRecords(
      JSON.parse(storage.getItem(USAGE_STORAGE_KEY) || "null"),
    );
  } catch {
    return [];
  }
}

export function appendUsageRecord(
  records: KnowledgeUsage[],
  record: KnowledgeUsage,
): KnowledgeUsage[] {
  if (records.some((item) => item.runId === record.runId)) return records;
  return [record, ...records].slice(0, USAGE_LIMIT);
}

/**
 * Latest usage of a base scenario's first-cycle knowledge. Records whose cited
 * knowledge is missing, or is not first-cycle knowledge of that scenario, are
 * ignored so the graph never shows a use that cannot be traced.
 */
export function latestUsageFor(
  records: KnowledgeUsage[],
  knowledge: Knowledge[],
  base: Scenario,
): KnowledgeUsage | undefined {
  return records.find(
    (record) =>
      record.baseScenarioId === base.id &&
      record.usedKnowledge.every((used) => {
        const item = knowledge.find((entry) => entry.id === used.id);
        return Boolean(
          item &&
            item.isNew &&
            (item.scenarioId
              ? item.scenarioId === base.id
              : cycleOneKnowledge([item], base)),
        );
      }),
  );
}

export function usageForKnowledge(
  records: KnowledgeUsage[],
  knowledgeId: string,
) {
  return records.filter((record) =>
    record.usedKnowledge.some((item) => item.id === knowledgeId),
  );
}

export type MergeState = {
  ready: boolean;
  savedId: string | null;
  review: "draft" | "changes" | "approved";
  checked: boolean;
  validDraft: boolean;
};

/** The existing manual gate: answer ready, checked, approved, not yet merged. */
export function canMergeKnowledge(state: MergeState): boolean {
  return (
    state.ready &&
    !state.savedId &&
    state.review === "approved" &&
    state.checked &&
    state.validDraft
  );
}

export function buildMergedKnowledge({
  id,
  draft,
  scenario,
  expert,
  question,
  sourceIds,
  extraDialogue,
  reviewComment,
  basedOn,
  now = new Date(),
}: {
  id: string;
  draft: Pick<Knowledge, "title" | "summary" | "conditions">;
  scenario: Scenario;
  expert: Expert;
  question: string;
  sourceIds: string[];
  extraDialogue: Scenario["dialogue"];
  reviewComment: string;
  basedOn?: Knowledge;
  now?: Date;
}): Knowledge {
  return {
    id,
    scenarioId: scenario.id as ScenarioId,
    ...draft,
    tags: [...scenario.tags],
    author: expert.name,
    date: new Intl.DateTimeFormat("ja-JP").format(now).replaceAll("/", "."),
    isNew: true,
    recommendations: scenario.recommendations.map((item) => ({ ...item })),
    provenance: {
      question,
      sourceIds: [...new Set(sourceIds)],
      dialogue: [...scenario.dialogue, ...extraDialogue],
      ...(basedOn
        ? { basedOn: [{ id: basedOn.id, title: basedOn.title }] }
        : {}),
      review: {
        reviewer: expert.name,
        comment: reviewComment,
        mergedAt: now.toISOString(),
        simulated: true,
      },
    },
  };
}

/** Adds a merged note unless the same ID is already stored. */
export function addKnowledgeOnce(
  knowledge: Knowledge[],
  item: Knowledge,
): Knowledge[] {
  return knowledge.some((existing) => existing.id === item.id)
    ? knowledge
    : [item, ...knowledge];
}

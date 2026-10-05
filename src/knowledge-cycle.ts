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
  | {
      /** An existing (seed) note returned by the same search. */
      kind: "document";
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
  /** Cites the registered (Merged) knowledge. */
  usesKnowledge: boolean;
};

/**
 * "knowledge-only": registered knowledge plus retrieved notes cover every
 * check, so the answer is compiled without expert matching, interview or a
 * new Knowledge PR. "interview": the usual flow.
 */
export type RunMode = "interview" | "knowledge-only";

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
  mode: RunMode;
  checks: ReuseCheck[];
  /** Knowledge-only answers: one-line summary of what the answer is built on. */
  summary?: string;
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

/** Passage of an existing note (summary first, then its guidance, then the title). */
export function findDocumentPassage(
  item: Knowledge,
  keywords: string[],
): { location: string; quote: string } | undefined {
  const hit = (text: string) => keywords.some((word) => text.includes(word));
  if (hit(item.summary)) return { location: "要約", quote: item.summary };
  for (const recommendation of item.recommendations ?? []) {
    if (hit(`${recommendation.title} ${recommendation.body}`)) {
      return { location: recommendation.title, quote: recommendation.body };
    }
  }
  if (hit(item.title)) return { location: "タイトル", quote: item.title };
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
  const checks: ReuseCheck[] = plan.reuse.map((rule) => {
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
  if (cycleOne) checks.push(...conditionsCheck(cycleOne));
  return checks.filter((check) => check.sources.length > 0);
}

function conditionsCheck(cycleOne: Knowledge): ReuseCheck[] {
  return cycleOne.conditions
    ? [
        {
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
        },
      ]
    : [];
}

/**
 * Every check sourced from the registered knowledge or, failing that, from an
 * existing note in the same search results. Undefined when any check would
 * still need the expert.
 */
function knowledgeOnlyChecks(
  scenario: Scenario,
  cycleOne: Knowledge,
  retrieval: RunContext["retrieval"],
): ReuseCheck[] | undefined {
  const plan = scenario.followUp;
  if (!plan) return undefined;
  const notes = retrieval.results
    .map((result) => result.item)
    .filter((item) => !item.isNew);
  const checks: ReuseCheck[] = [];
  for (const rule of plan.reuse) {
    const passage = findPassage(cycleOne, rule.find);
    if (passage) {
      checks.push({
        id: rule.id,
        label: rule.label,
        topic: rule.topic,
        appliedAs: rule.appliedAs,
        sources: [
          {
            kind: "knowledge",
            knowledgeId: cycleOne.id,
            knowledgeTitle: cycleOne.title,
            ...passage,
          },
        ],
        usesKnowledge: true,
      });
      continue;
    }
    const words = rule.noteFind ?? rule.find;
    const note = notes.find((item) => findDocumentPassage(item, words));
    if (!note) return undefined;
    checks.push({
      id: rule.id,
      label: rule.label,
      topic: rule.topic,
      appliedAs: rule.appliedAs,
      sources: [
        {
          kind: "document",
          knowledgeId: note.id,
          knowledgeTitle: note.title,
          ...findDocumentPassage(note, words)!,
        },
      ],
      usesKnowledge: false,
    });
  }
  return [...checks, ...conditionsCheck(cycleOne)];
}

function resolveKnowledgeOnly(
  scenario: Scenario,
  cycleOne: Knowledge,
  checks: ReuseCheck[],
): { scenario: Scenario; summary: string } {
  const notes = [
    ...new Map(
      checks
        .flatMap((check) => check.sources)
        .filter((source) => source.kind === "document")
        .map((source) => [source.knowledgeId, source.knowledgeTitle]),
    ).values(),
  ];
  const basis = `登録知見「${cycleOne.title}」（${shortId(cycleOne.id)}）${
    notes.length ? `と既存ナレッジ「${notes.join("」「")}」` : ""
  }`;
  const labels = checks
    .filter((check) => check.id !== "conditions")
    .map((check) => check.label);
  const summary = `${basis}をもとに、${labels.join("・")}の${checks.length}件の確認事項にまとめました。専門家への追加の確認は行っていません。`;
  return {
    summary,
    scenario: {
      ...scenario,
      gap: `${basis}で、今回の確認事項（${labels.join("・")}）をすべて根拠つきで示せます。専門家の選定・インタビューは不要と判断しました。`,
      insight: summary,
      conditions:
        "登録知見と既存ナレッジをまとめた回答です。原資料にない材質・数値条件は断定していません。適用前に、対象形状と実際の製造条件が各知見の適用条件の範囲内かを担当の匠が確認してください。",
    },
  };
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
  if (!scenario.followUp) {
    return { scenario, retrieval, checks: [], mode: "interview" };
  }
  const registered = cycleOneKnowledge(knowledge, baseScenarioOf(scenario));
  const retrieved = Boolean(
    registered &&
      retrieval.results.some((result) => result.item.id === registered.id),
  );
  const candidate = retrieved ? registered : undefined;
  const sufficient = candidate
    ? knowledgeOnlyChecks(scenario, candidate, retrieval)
    : undefined;
  if (candidate && sufficient) {
    const resolved = resolveKnowledgeOnly(scenario, candidate, sufficient);
    return {
      scenario: resolved.scenario,
      retrieval,
      cycleOne: candidate,
      registered,
      status: "used",
      mode: "knowledge-only",
      checks: sufficient,
      summary: resolved.summary,
    };
  }
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
    mode: "interview",
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

/**
 * How the current answer used registered knowledge. Kept in the session only:
 * it is shown as an overlay and never added to the ontology.
 */
export type KnowledgeUsage = {
  runId: string;
  scenarioId: FollowUpScenarioId;
  baseScenarioId: BaseScenarioId;
  question: string;
  answeredAt: string;
  usedKnowledge: UsedKnowledge[];
  checks: ReuseCheck[];
  mode: RunMode;
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
    mode: run.mode,
  };
}

/**
 * Latest usage of a base scenario's registered knowledge. Usage whose cited
 * knowledge is missing, or is not registered knowledge of that scenario, is
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

/** Display label for where a check's evidence comes from. */
export function sourceLabel(source: ReuseSource): string {
  return source.kind === "knowledge"
    ? `登録知見 ${shortId(source.knowledgeId)} · ${source.location}`
    : source.kind === "document"
      ? `既存ナレッジ ${source.knowledgeId}「${source.knowledgeTitle}」 · ${source.location}`
      : source.label;
}

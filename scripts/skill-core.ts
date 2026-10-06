/*
 * The six Codex skills of the TAKUMI demo. Each skill reads the demo data and
 * the Merged knowledge, does the step with the same functions the screen uses
 * (search, expert matching, question planning, ontology), writes what it
 * produced to workspace/<consultation>/ and moves the shared runtime state to
 * the step, so the screen follows. Approve review and Merge are left to a
 * person on the screen; no skill registers knowledge.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  allScenarios,
  baseScenarioOf,
  experts,
  matchScenario,
  mergeKnowledge,
  scenarios,
  type Knowledge,
  type Scenario,
  type ScenarioId,
} from "../src/data.ts";
import {
  answerReason,
  prepareRun,
  shortId,
  sourceLabel,
  type RunContext,
} from "../src/knowledge-cycle.ts";
import { buildQuestions, recommendExperts } from "../src/process-model.ts";
import {
  buildOntology,
  countSummary,
  expertSpotlight,
  questionPlanProjection,
  questionStory,
} from "../src/ontology.ts";
import {
  logEvent,
  paths,
  readKnowledge,
  readState,
  updateState,
} from "./runtime-store.mjs";

export const skills = [
  "takumi-launch",
  "design-consultation",
  "expert-matching",
  "interview-plan",
  "expert-interview",
  "knowledge-pr",
] as const;
export type SkillName = (typeof skills)[number];

type Stage = "search" | "experts" | "plan" | "interview" | "pr" | "merged" | "answered";

export type Consultation = {
  id: string;
  question: string;
  scenarioId: ScenarioId;
  mode: RunContext["mode"];
  stage: Stage;
  /** How far the screen plays the consultation (ProcessWorkspace tick). */
  targetTick: number;
  /** Output panel to open; null follows the live step. */
  step: number | null;
  /** Merged knowledge the search ran against. */
  knowledgeIds: string[];
  merged?: string;
  createdAt: string;
};

export type SkillResult = {
  skill: SkillName;
  status: "success" | "skipped" | "error";
  /** What happened, in Japanese, for Codex to report. */
  message: string;
  /** What to point at in the right-hand screen. */
  screen: string;
  next: string;
  url?: string;
  consultationId?: string;
  mode?: RunContext["mode"];
  artifacts: string[];
  details: Record<string, unknown>;
};

const ORDER: Stage[] = ["search", "experts", "plan", "interview", "pr", "merged"];
const stageTick: Record<Stage, number> = {
  search: 1,
  experts: 2,
  plan: 3,
  interview: 9,
  pr: 9,
  merged: 9,
  answered: 9,
};
const reached = (consultation: Consultation, stage: Stage) =>
  ORDER.indexOf(consultation.stage) >= ORDER.indexOf(stage);

const SAMPLE_QUESTION = scenarios[2].question;
const NOT_A_PREDICTION = "専門家の回答はデモ用に準備した内容で、AIの生成結果ではありません。";

const expertOf = (scenario: Scenario) =>
  experts.find((item) => item.id === scenario.expertId)!;

function runFor(consultation: Consultation, stored: Knowledge[]) {
  const scenario = allScenarios.find((item) => item.id === consultation.scenarioId)!;
  const knowledge = mergeKnowledge(
    stored.filter((item) => consultation.knowledgeIds.includes(item.id)),
  );
  return prepareRun({ query: consultation.question, scenario, knowledge });
}

async function writeArtifact(
  root: string,
  consultationId: string,
  name: string,
  content: string,
) {
  const folder = join(paths(root).workspace, consultationId);
  await mkdir(folder, { recursive: true });
  const file = join(folder, name);
  await writeFile(file, content, "utf8");
  return relative(root, file);
}

const bullet = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

function searchReport(consultation: Consultation, run: RunContext, total: number) {
  const registered = new Set(consultation.knowledgeIds);
  return `# ${consultation.id} 設計相談：ナレッジ検索

- 相談内容：${consultation.question}
- 振り分けたテーマ：${run.scenario.label}（${run.scenario.id}）
- 検索対象：${total}件（初期ナレッジと、人が承認してMergeした登録知見${registered.size}件）
- 抽出語：${run.retrieval.extracted.join(" / ") || "なし"}
- 展開語：${run.retrieval.expanded.join(" / ")}

## 検索結果（一致した語が多い順）

${bullet(
  run.retrieval.results.map(
    (result) =>
      `${result.item.id}${result.item.isNew ? "（登録知見・Merge済み）" : ""}「${result.item.title}」 一致：${result.matched.join(" / ")}`,
  ),
)}

## 不足している知識（Knowledge gap）

${run.scenario.gap}

## 回答方式

${
  run.mode === "knowledge-only"
    ? `${answerReason(run)}専門家の選定・質問生成・インタビューと、新しい知見の登録PRは行いません。`
    : "登録知見だけでは答えられないため、匠の選定とインタビューに進みます。"
}
`;
}

function answerReport(consultation: Consultation, run: RunContext) {
  const checks = run.checks.map(
    (check) =>
      `### ${check.label}\n\n${check.appliedAs ? `${check.appliedAs}\n\n` : ""}${check.sources
        .map((source) => `> ${sourceLabel(source)}：「${source.quote}」`)
        .join("\n>\n")}`,
  );
  return `# ${consultation.id} 設計への回答（登録知見から作成）

- 相談内容：${consultation.question}
- 使用した登録知見：${run.cited ? `${run.cited.title}（ID ${run.cited.id}）` : "なし"}

${run.summary ?? ""}

## 確認事項と根拠

${checks.join("\n\n")}

## 適用条件

${run.scenario.conditions}
`;
}

/** Runs one skill against the app folder `root`. */
export async function runSkill(
  name: string,
  { root, question, url }: { root: string; question?: string; url?: string },
): Promise<SkillResult> {
  if (!(skills as readonly string[]).includes(name)) {
    return {
      skill: name as SkillName,
      status: "error",
      message: `不明なスキルです。使えるスキル：${skills.join(", ")}`,
      screen: "",
      next: "",
      artifacts: [],
      details: {},
    };
  }
  const skill = name as SkillName;
  const state = await readState(root);
  const stored: Knowledge[] = await readKnowledge(root);
  const consultation: Consultation | null = state.consultation;
  const base = { skill, url, artifacts: [] as string[], details: {} as Record<string, unknown> };

  const finish = async (
    result: Omit<SkillResult, "skill" | "url" | "artifacts" | "details"> &
      Partial<Pick<SkillResult, "artifacts" | "details">>,
    change?: (current: typeof state) => typeof state,
  ): Promise<SkillResult> => {
    await updateState(root, (current: typeof state) => ({
      ...(change ? change(current) : current),
      lastSkill: {
        name: skill,
        status: result.status,
        message: result.message,
        at: new Date().toISOString(),
      },
      completedSkills:
        result.status === "success"
          ? [...current.completedSkills, skill]
          : current.completedSkills,
    }));
    await logEvent(root, {
      type: `skill.${result.status}`,
      skill,
      consultationId: result.consultationId,
    });
    return { ...base, ...result };
  };

  // Steps after the search need a consultation that is still waiting on the expert.
  const needsInterview = (stage: Stage): SkillResult | null => {
    if (!consultation) {
      return {
        ...base,
        status: "error",
        message: "相談がまだありません。先に $design-consultation で相談を受け付けてください。",
        screen: "",
        next: "$design-consultation",
      };
    }
    if (consultation.mode === "knowledge-only") {
      return {
        ...base,
        status: "skipped",
        consultationId: consultation.id,
        mode: consultation.mode,
        message: `${consultation.id} は登録知見だけで回答済みのため、この工程は不要です（匠の選定・質問生成・インタビュー・登録PRは行いません）。`,
        screen: "Design Response（登録知見の活用）",
        next: "別の相談は $design-consultation で受け付けます。",
      };
    }
    const previous = ORDER[ORDER.indexOf(stage) - 1];
    if (previous && !reached(consultation, previous)) {
      const skillFor: Partial<Record<Stage, string>> = {
        experts: "$expert-matching",
        plan: "$interview-plan",
        interview: "$expert-interview",
      };
      return {
        ...base,
        status: "error",
        consultationId: consultation.id,
        message: `まだ前の工程が終わっていません。先に ${skillFor[previous] ?? "前のスキル"} を実行してください。`,
        screen: "",
        next: skillFor[previous] ?? "",
      };
    }
    return null;
  };

  const advance = (stage: Stage, step: number | null = null) => (current: typeof state) => ({
    ...current,
    screen: "consultation",
    consultation: {
      ...current.consultation,
      stage: reached(current.consultation, stage) ? current.consultation.stage : stage,
      targetTick: Math.max(current.consultation.targetTick, stageTick[stage]),
      step,
    },
  });

  if (skill === "takumi-launch") {
    const knowledge = mergeKnowledge(stored);
    const theme = consultation
      ? baseScenarioOf(allScenarios.find((item) => item.id === consultation.scenarioId)!)
      : scenarios[2];
    const view = buildOntology({ knowledge, scenario: theme, stage: "after" });
    const counts = countSummary(view);
    return finish(
      {
        status: "success",
        message: `ナレッジワークスペースを開きました。ナレッジ${knowledge.length}件（うち人が承認してMergeした登録知見${stored.length}件）、匠${experts.length}名を収録しています。右側にKnowledge Graph（${theme.label}、${counts.nodes}ノード・${counts.links}関係）を表示しました。`,
        screen: `Knowledge Graph「${view.stage === "before" ? "① 登録前" : "② 追加後"}」`,
        next: "$design-consultation に相談内容を添えて実行してください。",
        details: {
          knowledge: knowledge.length,
          registered: stored.map((item) => ({ id: item.id, title: item.title })),
          experts: experts.length,
          graph: { theme: theme.label, ...counts },
        },
      },
      (current) => ({ ...current, screen: "graph", graphScenarioId: theme.id }),
    );
  }

  if (skill === "design-consultation") {
    const text = question?.trim() || SAMPLE_QUESTION;
    const scenario = matchScenario(text);
    const seq = state.consultationSeq + 1;
    const id = `TKM-${String(seq).padStart(3, "0")}`;
    const next: Consultation = {
      id,
      question: text,
      scenarioId: scenario.id,
      mode: "interview",
      stage: "search",
      targetTick: 1,
      step: null,
      knowledgeIds: stored.map((item) => item.id),
      createdAt: new Date().toISOString(),
    };
    const run = runFor(next, stored);
    next.mode = run.mode;
    if (run.mode === "knowledge-only") {
      next.stage = "answered";
      next.targetTick = 9;
    }
    const total = run.retrieval.searchedCount;
    const artifacts = [await writeArtifact(root, id, "01-knowledge-search.md", searchReport(next, run, total))];
    if (run.mode === "knowledge-only") {
      artifacts.push(await writeArtifact(root, id, "02-design-response.md", answerReport(next, run)));
    }
    const results = run.retrieval.results.map((result) => ({
      id: result.item.id,
      title: result.item.title,
      registered: Boolean(result.item.isNew),
      matched: result.matched,
    }));
    const common = {
      consultationId: id,
      mode: run.mode,
      artifacts,
      details: {
        question: text,
        theme: run.scenario.label,
        searched: total,
        results,
        registeredKnowledge: run.cited
          ? { id: run.cited.id, title: run.cited.title, match: run.match === "same" ? "同じ相談" : "関連する相談" }
          : null,
        gap: run.scenario.gap,
        ...(run.mode === "knowledge-only"
          ? {
              answer: run.summary,
              checks: run.checks.map((check) => ({
                label: check.label,
                sources: check.sources.map((source) => sourceLabel(source)),
              })),
            }
          : {}),
      },
    };
    const updateConsultation = (current: typeof state) => ({
      ...current,
      screen: "consultation",
      consultationSeq: seq,
      consultation: next,
    });
    if (run.mode === "knowledge-only") {
      return finish(
        {
          status: "success",
          ...common,
          message: `相談 ${id} を受け付け、${total}件のナレッジを検索しました。${answerReason(run)}そのため、匠の選定・質問生成・インタビューと、新しい知見の登録PRは行わず、登録知見「${run.cited!.title}」（${shortId(run.cited!.id)}）${run.checks.some((check) => check.sources.some((source) => source.kind === "document")) ? "と既存ナレッジ" : ""}の本文から回答をまとめました。`,
          screen: "Knowledge retrieved → Registered knowledge found → Expert interview skipped → Response compiled、Design Responseの「登録知見の活用」とナレッジグラフ",
          next: "回答はここで完了です。別の相談は $design-consultation で受け付けます。",
        },
        updateConsultation,
      );
    }
    return finish(
      {
        status: "success",
        ...common,
        message: `相談 ${id}（${run.scenario.label}）を受け付け、${total}件のナレッジを検索して${results.length}件を取得しました。${
          run.cited
            ? `登録知見「${run.cited.title}」も見つかりましたが、確認事項の一部はまだ根拠がありません。`
            : "この相談に答えられる登録知見はまだありません。"
        }不足している知識：${run.scenario.gap}`,
        screen: "Knowledge Search（取得した知見、Retrieval graph、Knowledge gap）",
        next: "$expert-matching で、不足している判断基準を聞ける匠を選びます。",
      },
      updateConsultation,
    );
  }

  if (skill === "expert-matching") {
    const blocked = needsInterview("experts");
    if (blocked) return blocked.status === "error" ? blocked : finish(blocked);
    const run = runFor(consultation!, stored);
    const candidates = recommendExperts(run.scenario, run.retrieval);
    const knowledge = mergeKnowledge(stored.filter((item) => consultation!.knowledgeIds.includes(item.id)));
    const view = buildOntology({ knowledge, scenario: run.scenario, stage: "after" });
    const expected = candidates.map((candidate) =>
      expertSpotlight({ view, scenario: run.scenario, candidate }),
    );
    const chosen = candidates.find((candidate) => candidate.selected)!;
    const artifact = await writeArtifact(
      root,
      consultation!.id,
      "02-expert-matching.md",
      `# ${consultation!.id} 匠の選定

登録された${experts.length}名の専門領域と、検索結果の執筆者を照合しました。

${candidates
  .map(
    (candidate, index) => `## ${index + 1}. ${candidate.expert.name}${candidate.selected ? "（対話担当）" : ""}

- 役割：${candidate.expert.role}（経験${candidate.expert.years}年）
- 推薦理由：${candidate.reason}
- 専門（ナレッジグラフ上の観点）：${expected[index].specialties.map((item) => `${item.label}（${item.domain}）`).join("・") || "なし"}
- インタビューで知見を追加できるところ（想定・未登録）：${expected[index].targets.map((item) => `${item.typeLabel}「${item.label}」`).join(" / ")} → 想定される知見「${expected[index].extraNodes[0].label}」`,
  )
  .join("\n\n")}
`,
    );
    return finish(
      {
        status: "success",
        consultationId: consultation!.id,
        mode: consultation!.mode,
        artifacts: [artifact],
        details: {
          candidates: candidates.map((candidate, index) => ({
            name: candidate.expert.name,
            role: candidate.expert.role,
            selected: candidate.selected,
            matched: candidate.matched,
            ownNotes: candidate.sources.length,
            canAddTo: expected[index].targets.map((item) => `${item.typeLabel}：${item.label}`),
          })),
        },
        message: `専門領域と検索結果の執筆者を照合し、候補${candidates.length}名を選びました。対話担当は${chosen.expert.name}（${chosen.expert.role}）です。ナレッジグラフ全体に候補者の所属と専門を表示しました。候補者の名前を選ぶと、その人へのインタビューで知見を追加できるところ（想定・未登録）を強調します。`,
        screen: "Expert Matching（左：ナレッジグラフ全体、右：候補者。名前を選ぶと、知見を追加できるところを強調）",
        next: "$interview-plan で、既存の知見から不足点を整理して質問を作ります。",
      },
      advance("experts"),
    );
  }

  if (skill === "interview-plan") {
    const blocked = needsInterview("plan");
    if (blocked) return blocked.status === "error" ? blocked : finish(blocked);
    const run = runFor(consultation!, stored);
    const knowledge = mergeKnowledge(stored.filter((item) => consultation!.knowledgeIds.includes(item.id)));
    const questions = buildQuestions(run.scenario).filter((item) => item.availableAt <= stageTick.plan);
    const plan = questionPlanProjection({ knowledge, scenario: run.scenario, retrieval: run.retrieval, questions });
    const story = questionStory({ knowledge, scenario: run.scenario, retrieval: run.retrieval, questions });
    const rows = plan.rows.map((row) => ({
      question: `${row.question.id}：${row.question.text}`,
      knownFrom: row.notes.map((note) => `${note.id}「${note.title}」`),
      unknown: row.unknown,
      topics: row.topics,
    }));
    const artifact = await writeArtifact(
      root,
      consultation!.id,
      "03-question-plan.md",
      `# ${consultation!.id} 質問計画

既存知見 → 確認したい点 → 生成した質問（一時的な計画で、新しい知見としては登録しません）。

## 質問に至った流れ（画面ではナレッジグラフ全体から順に再生）

${story.map((step, index) => `${index + 1}. ${step.title}：${step.text}`).join("\n")}

${plan.rows
  .map(
    (row) => `## ${row.question.id}

- 既存知見：${row.notes.map((note) => `${note.id}「${note.title}」：${note.summary}`).join(" / ")}
- 確認したい点：${row.unknown}${row.topics.length ? `（観点：${row.topics.join("・")}）` : ""}
- 生成した質問：${row.question.text}`,
  )
  .join("\n\n")}

Q2以降は、インタビュー中に匠の回答を受けて生成します。
`,
    );
    return finish(
      {
        status: "success",
        consultationId: consultation!.id,
        mode: consultation!.mode,
        artifacts: [artifact],
        details: { questions: rows, story: story.map((step) => step.title) },
        message: `取得した知見を確認し、まだ分からない点を整理して最初の質問を作りました。${rows
          .map((row) => `既存知見 ${row.knownFrom.join("・")} → 確認したい点「${row.unknown}」 → ${row.question}`)
          .join(" ")} 追加の質問は、インタビュー中に匠の回答を受けて作ります。`,
        screen: "Question Plan（ナレッジグラフ全体の上で、参照した既存知見 → まだ分からない点 → 質問の流れを自動再生。質問カード）",
        next: "$expert-interview で、匠へのインタビューを始めます。",
      },
      advance("plan"),
    );
  }

  if (skill === "expert-interview") {
    const blocked = needsInterview("interview");
    if (blocked) return blocked.status === "error" ? blocked : finish(blocked);
    const run = runFor(consultation!, stored);
    const expert = expertOf(run.scenario);
    const knowledge = mergeKnowledge(stored.filter((item) => consultation!.knowledgeIds.includes(item.id)));
    const questions = buildQuestions(run.scenario);
    const plan = questionPlanProjection({ knowledge, scenario: run.scenario, retrieval: run.retrieval, questions });
    let answer = 0;
    const dialogue = run.scenario.dialogue.map((message) => {
      if (message.speaker === "ai") return `**TAKUMI Agent**：${message.text}`;
      answer += 1;
      return `**A${answer} ${expert.name}**（デモ用に準備した回答）：${message.text}`;
    });
    const artifacts = [
      await writeArtifact(
        root,
        consultation!.id,
        "04-interview.md",
        `# ${consultation!.id} 匠インタビュー（模擬）

対話担当：${expert.name}（${expert.role}）。${NOT_A_PREDICTION}

${dialogue.join("\n\n")}

## 質問の根拠

${plan.rows
  .map((row) => `- ${row.question.id}：${row.unknown}${row.answer ? `（${row.answer.label}を受けて）` : ""}${row.notes.length ? ` / 既存知見 ${row.notes.map((note) => note.id).join("・")}` : ""}`)
  .join("\n")}
`,
      ),
      await writeArtifact(
        root,
        consultation!.id,
        "05-design-response.md",
        `# ${consultation!.id} 設計への回答

${run.scenario.insight}

## 設計への提案

${run.scenario.recommendations.map((item) => `### ${item.title}\n\n${item.body}`).join("\n\n")}
${
  run.cited
    ? `\n## 登録知見の活用\n\n使用した登録知見：${run.cited.title}（ID ${run.cited.id}）\n\n${bullet(
        run.checks.map((check) => `${check.label}：${check.sources.map((source) => sourceLabel(source)).join(" + ")}`),
      )}\n`
    : ""
}
## 適用条件

${run.scenario.conditions}
`,
      ),
    ];
    return finish(
      {
        status: "success",
        consultationId: consultation!.id,
        mode: consultation!.mode,
        artifacts,
        details: {
          expert: expert.name,
          questions: questions.length,
          insight: run.scenario.insight,
          recommendations: run.scenario.recommendations.map((item) => item.title),
        },
        message: `${expert.name}への模擬インタビュー（質問${questions.length}件）を再生し、設計への回答をまとめました。要点：${run.scenario.insight} ${NOT_A_PREDICTION}`,
        screen: "Interview（対話の再生）→ Design Response",
        next: "$knowledge-pr で、今回の知見を登録PRにします。",
      },
      advance("interview"),
    );
  }

  // knowledge-pr
  const blocked = needsInterview("pr");
  if (blocked) return blocked.status === "error" ? blocked : finish(blocked);
  if (consultation!.merged) {
    return finish({
      status: "skipped",
      consultationId: consultation!.id,
      mode: consultation!.mode,
      message: `${consultation!.id} の知見はすでにMerge済みです（ID ${consultation!.merged}）。`,
      screen: "Knowledge PR（Merged）",
      next: "関連する相談を $design-consultation で受け付けると、この登録知見から回答できます。",
    });
  }
  const run = runFor(consultation!, stored);
  const expert = expertOf(run.scenario);
  const artifact = await writeArtifact(
    root,
    consultation!.id,
    "06-knowledge-pr.md",
    `# 登録PR（ドラフト）：${run.scenario.title}

- 状態：レビュー待ち（Approve review と Merge は画面で人が行います）
- レビュアー：${expert.name}（模擬）
- 元の相談：${consultation!.question}

## Summary

${run.scenario.insight}

## Recommendations

${bullet(run.scenario.recommendations.map((item) => `${item.title}：${item.body}`))}

## Conditions

${run.scenario.conditions}

## Sources & provenance

- 参照記事：${run.retrieval.results.map((result) => result.item.id).join(", ")}
- 対話：Q1〜A${run.scenario.dialogue.filter((message) => message.speaker === "expert").length} · ${expert.name}
${run.cited ? `- 発展元（参照した登録知見）：${run.cited.title}（${shortId(run.cited.id)}）。上書きせず新しいノートとして追加します。\n` : ""}`,
  );
  return finish(
    {
      status: "success",
      consultationId: consultation!.id,
      mode: consultation!.mode,
      artifacts: [artifact],
      details: {
        title: run.scenario.title,
        reviewer: expert.name,
        sources: run.retrieval.results.map((result) => result.item.id),
      },
      message: `今回の知見「${run.scenario.title}」の登録PRを作成しました（レビュアー：${expert.name}・模擬）。登録は人の承認が必要なため、スキルではマージしていません。画面で出典・適用条件・重複候補を確認し、「Approve review」→「Merge knowledge PR」を押すと、ナレッジグラフに追加されます。`,
      screen: "Knowledge PR（差分・出典・適用条件・レビュー）",
      next: "画面で Approve review と Merge を行ってください。その後、同じ相談や関連する相談を $design-consultation で受け付けると、登録知見だけで回答します。",
    },
    advance("pr", 5),
  );
}

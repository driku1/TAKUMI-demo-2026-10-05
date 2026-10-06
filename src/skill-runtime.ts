import type { BaseScenarioId, Knowledge, ScenarioId } from "./data";

/*
 * Codex skill mode. When the demo runs with `npm run demo:start`
 * (start-demo.mjs --skills), the server hands the page the shared runtime:
 * the step each skill moved the consultation to, and the Merged knowledge.
 * The page follows it; Approve review and Merge stay on the screen.
 */

export type SkillConsultation = {
  id: string;
  question: string;
  scenarioId: ScenarioId;
  mode: "interview" | "knowledge-only";
  stage: "search" | "experts" | "plan" | "interview" | "pr" | "merged" | "answered";
  targetTick: number;
  step: number | null;
  knowledgeIds: string[];
  merged?: string;
};

export type SkillState = {
  revision: number;
  resetAt: string;
  screen: "home" | "graph" | "consultation";
  graphScenarioId: BaseScenarioId;
  consultation: SkillConsultation | null;
  lastSkill: {
    name: string;
    status: "success" | "skipped" | "error";
    message: string;
    at: string;
  } | null;
  knowledgeRevision: number;
};

export const skillRuntime = (
  globalThis as { __TAKUMI_SKILLS__?: { state: SkillState; knowledge: Knowledge[] } }
).__TAKUMI_SKILLS__;

export async function fetchSkillState(): Promise<SkillState | null> {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    return response.ok ? ((await response.json()) as SkillState) : null;
  } catch {
    return null;
  }
}

export async function fetchSkillKnowledge(): Promise<Knowledge[] | null> {
  try {
    const response = await fetch("/api/knowledge", { cache: "no-store" });
    return response.ok ? ((await response.json()) as Knowledge[]) : null;
  } catch {
    return null;
  }
}

/** Saves a note a person approved and Merged on the screen. */
export async function postMerge(item: Knowledge, consultationId: string | null) {
  try {
    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item, consultationId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** What to do next, shown on the consultation while skills drive it. */
export function nextSkillHint(consultation: SkillConsultation): string {
  if (consultation.mode === "knowledge-only") {
    return "登録知見だけで回答しました（匠の選定・インタビュー・登録PRは不要）。別の相談は Codex で $design-consultation";
  }
  switch (consultation.stage) {
    case "search":
      return "次：Codexチャットで $expert-matching（匠の選定）";
    case "experts":
      return "次：Codexチャットで $interview-plan（質問計画）";
    case "plan":
      return "次：Codexチャットで $expert-interview（匠インタビュー）";
    case "interview":
      return "次：Codexチャットで $knowledge-pr（知見の登録PR）";
    case "pr":
      return "画面で確認チェック → Approve review → Merge knowledge PR を押してください（スキルではマージしません）";
    default:
      return "登録しました。同じ相談・関連する相談は Codex で $design-consultation を実行すると、登録知見から回答します";
  }
}

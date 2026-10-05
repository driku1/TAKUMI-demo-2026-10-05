import {
  experts,
  type Knowledge,
  type Scenario,
  type ScenarioId,
} from "./data.ts";

const expansions = {
  aluminum: [
    "切削加工",
    "薄肉加工",
    "A6061",
    "治具設計",
    "残留応力",
    "加工変形",
  ],
  welding: ["溶接変形", "仮付け", "接合", "温度管理", "治具設計"],
  molding: ["射出成形", "ヒケ", "保圧", "金型設計", "ゲート設計"],
  "aluminum-c2": [
    "薄肉加工",
    "治具設計",
    "加工変形",
    "A6061",
    "切削加工",
    "残留応力",
  ],
  "welding-c2": [
    "溶接変形",
    "仮付け",
    "治具設計",
    "ステンレス",
    "温度管理",
    "接合",
  ],
  "molding-c2": [
    "反り",
    "リブ",
    "ゲート設計",
    "ゲート",
    "冷却",
    "射出成形",
    "金型設計",
  ],
} satisfies Record<ScenarioId, string[]>;

/** Transparent local demo retrieval: ranked lexical matches, not an AI confidence score. */
export function retrieveKnowledge(
  query: string,
  scenario: Scenario,
  knowledge: Knowledge[],
) {
  const vocabulary = [...new Set(knowledge.flatMap((item) => item.tags))];
  const extracted = vocabulary.filter((term) =>
    query.toLowerCase().includes(term.toLowerCase()),
  );
  const expanded = expansions[scenario.id].filter(
    (term) => !extracted.includes(term),
  );
  const terms = [...new Set([...extracted, ...expanded])];
  const results = knowledge
    .map((item) => {
      const matched = terms.filter((term) =>
        `${item.title} ${item.summary} ${item.tags.join(" ")}`.includes(term),
      );
      const score = matched.reduce(
        (sum, term) =>
          sum +
          (item.tags.includes(term) ? 4 : 0) +
          (item.title.includes(term) ? 3 : 0) +
          (item.summary.includes(term) ? 1 : 0),
        0,
      );
      return { item, matched, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, 6);
  return {
    extracted,
    expanded,
    terms,
    results,
    searchedCount: knowledge.length,
  };
}

export function recommendExperts(
  scenario: Scenario,
  retrieval: ReturnType<typeof retrieveKnowledge>,
) {
  return experts
    .map((expert) => {
      const matched = expert.tags.filter((tag) =>
        retrieval.terms.includes(tag),
      );
      const sources = retrieval.results.filter(
        (result) => result.item.author === expert.name,
      );
      const selected = expert.id === scenario.expertId;
      return {
        expert,
        matched,
        sources,
        selected,
        reason: selected
          ? `${scenario.label}の模擬インタビュー担当。${matched.length ? `専門領域「${matched.join("・")}」が探索語と一致。` : ""}検索結果に本人の知見が${sources.length}件あります。`
          : matched.length
            ? `「${matched.join("・")}」で関連あり。検索結果に本人の知見が${sources.length}件。今回は主領域を担当する匠を優先します。`
            : `登録専門領域は「${expert.tags.join("・")}」。今回の探索語との直接一致がないため、補助候補とします。`,
      };
    })
    .filter(
      (candidate) =>
        candidate.selected ||
        candidate.matched.length > 0 ||
        candidate.sources.length > 0,
    )
    .sort(
      (a, b) =>
        Number(b.selected) - Number(a.selected) ||
        b.matched.length - a.matched.length ||
        b.sources.length - a.sources.length ||
        a.expert.id - b.expert.id,
    )
    .slice(0, 5);
}

export function buildQuestions(scenario: Scenario) {
  return scenario.dialogue.flatMap((message, index) =>
    message.speaker === "ai"
      ? [
          {
            id: `Q${Math.floor(index / 2) + 1}`,
            text: message.text,
            availableAt: index === 0 ? 2 : index + 2,
            purpose:
              message.annotation ||
              "既存知識で不足している初期確認の判断基準を確認",
            trigger:
              index === 0 ? scenario.gap : scenario.dialogue[index - 1].text,
            origin:
              index === 0
                ? "検索結果の不足知識"
                : `A${Math.floor(index / 2)}：匠の直前の回答`,
          },
        ]
      : [],
  );
}

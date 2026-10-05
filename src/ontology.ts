import {
  experts,
  followUpOf,
  initialKnowledge,
  scenarios,
  allScenarios,
  type BaseScenarioId,
  type Knowledge,
  type Scenario,
} from "./data.ts";
import { retrieveKnowledge } from "./process-model.ts";
import {
  cycleOneKnowledge,
  cycleTwoKnowledge,
  latestUsageFor,
  shortId,
  type KnowledgeUsage,
} from "./knowledge-cycle.ts";

/*
 * Manufacturing ontology, ported from the Automotive Summit ontology screen
 * (ontology-v0.04.html): an organization zone and a product/knowledge zone,
 * card nodes on fixed coordinates, typed relations and layer filters.
 * Vehicle / ECU / artifact / incident nodes are replaced by process domain,
 * part, issue, topic and document nodes; organization nodes (company,
 * division, department, team, person) and documents are kept. Only approved
 * (Merged) knowledge is added; consultations and answers are not stored.
 */

export const WORLD = { width: 1620, height: 1040 };

export type OntologyLayer = "org" | "process" | "issue" | "document" | "registered";
export type NodeKind =
  | "company"
  | "division"
  | "department"
  | "team"
  | "person"
  | "root"
  | "domain"
  | "part"
  | "issue"
  | "topic"
  | "document"
  | "knowledge";
export type Phase = "cycle1" | "cycle2";

export type OntologyNode = {
  id: string;
  kind: NodeKind;
  layer: OntologyLayer;
  typeLabel: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  path: string;
  desc: string;
  facts: { label: string; value: string }[];
  cluster?: BaseScenarioId;
  knowledgeId?: string;
  phase?: Phase;
};

/** Relation families shown in the legend. None of them expresses causation. */
export type EdgeKind =
  | "structure"
  | "organization"
  | "reference"
  | "tag"
  | "approval"
  | "usage";

export type OntologyEdge = {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label: string;
  phase?: Phase;
  /** Part of how the first-cycle knowledge was used in the second-cycle answer. */
  used?: boolean;
  /** Drawn faintly unless highlighted (e.g. authorship of many notes). */
  peripheral?: boolean;
};

export type OntologyStage = "before" | "after" | "focus" | "usage";

export const edgeKindLabels: Record<EdgeKind, string> = {
  structure: "構造・包含（配下・対象部品・確認観点・対象課題）",
  organization: "所属・担当・執筆",
  reference: "参照・出典（参照・発展元）",
  tag: "タグ一致・本文で言及（因果ではない）",
  approval: "承認（Approve review）",
  usage: "今回の回答で使用（④の重ね表示・保存しない）",
};

export const stageLabels: Record<
  OntologyStage,
  { button: string; title: string; description: string }
> = {
  before: {
    button: "① 登録前",
    title: "登録前｜既存の知識の関係",
    description:
      "初期ナレッジ・組織・工程の関係だけを表示します。登録済みの知見は削除せず、表示から外しています。",
  },
  after: {
    button: "② 追加後",
    title: "追加後｜Approve・Mergeした知見",
    description:
      "人が承認してMergeした知見と、自動で増えた関係（NEW）を重ねます。承認されていない相談・回答はグラフに入りません。",
  },
  focus: {
    button: "③ 新知見に注目",
    title: "新知見に注目｜接続先と詳細",
    description:
      "全体の位置づけを残したまま、登録知見の接続先と登録内容を表示します。",
  },
  usage: {
    button: "④ 回答での活用",
    title: "回答での活用｜今回の回答が使った登録知見",
    description:
      "表示中の相談の回答が、グラフ内のどの登録知見を使い、どの課題・観点に当てたかを重ねて表示します（USED）。この重ね表示は保存されず、グラフ自体は変わりません。",
  },
};

type ClusterDef = {
  id: BaseScenarioId;
  title: string;
  domain: string;
  team: string;
  department: string;
  expertId: number;
  x: number;
  width: number;
  part: { label: string; sub: string; desc: string };
  issues: {
    label: string;
    sub: string;
    keywords: string[];
    topics: string[];
    desc: string;
  }[];
  topics: { label: string; stems: string[] }[];
};

const clusterDefs: ClusterDef[] = [
  {
    id: "aluminum",
    title: "切削加工",
    domain: "切削加工",
    team: "精密加工チーム",
    department: "生産技術部",
    expertId: 1,
    x: 605,
    width: 300,
    part: {
      label: "薄肉ハウジング",
      sub: "切削部品の例",
      desc: "薄肉アルミハウジングの相談例で扱う対象部品です。",
    },
    issues: [
      {
        label: "加工変形",
        sub: "切削後の反り",
        keywords: ["加工変形"],
        topics: ["治具設計", "薄肉加工", "残留応力"],
        desc: "切削後に反りが出る課題。拘束した状態で削ることと素材の状態を切り分けます。",
      },
    ],
    topics: [
      { label: "治具設計", stems: ["治具"] },
      { label: "薄肉加工", stems: ["薄肉"] },
      { label: "残留応力", stems: ["残留応力"] },
    ],
  },
  {
    id: "welding",
    title: "材料・接合",
    domain: "材料・接合",
    team: "材料・接合チーム",
    department: "製造技術部",
    expertId: 2,
    x: 920,
    width: 290,
    part: {
      label: "ブラケット",
      sub: "ステンレス製の例",
      desc: "ステンレス製ブラケットの相談例で扱う対象部品です。",
    },
    issues: [
      {
        label: "溶接ひずみ",
        sub: "角度ひずみ",
        keywords: ["溶接変形", "ひずみ"],
        topics: ["仮付け", "温度管理", "接合"],
        desc: "溶接後の角度ひずみが安定しない課題。仮付け・順序・解放条件を一組で確認します。",
      },
    ],
    topics: [
      { label: "仮付け", stems: ["仮付け"] },
      { label: "温度管理", stems: ["温度", "入熱"] },
      { label: "接合", stems: ["接合"] },
    ],
  },
  {
    id: "molding",
    title: "金型・成形",
    domain: "金型・成形",
    team: "金型・成形チーム",
    department: "品質技術部",
    expertId: 3,
    x: 1225,
    width: 365,
    part: {
      label: "樹脂カバー",
      sub: "成形品の例",
      desc: "樹脂カバーの相談例で扱う対象部品です。",
    },
    issues: [
      {
        label: "リブ裏のヒケ",
        sub: "外観品質",
        keywords: ["ヒケ"],
        topics: ["リブ周辺", "保圧", "ゲート位置"],
        desc: "リブの裏側に出るヒケ。形状起因か成形条件起因かを切り分けます。",
      },
      {
        label: "量産時の反り",
        sub: "スライドの問い",
        keywords: ["反り"],
        topics: ["リブ周辺", "ゲート位置", "冷却回路"],
        desc: "スライドの問い「この形状を量産する際の注意点は？」で扱う課題。冷却時の収縮差による反りを、リブ周辺・ゲート位置・冷却回路のバランスから確認します。",
      },
    ],
    topics: [
      { label: "リブ周辺", stems: ["リブ"] },
      { label: "ゲート位置", stems: ["ゲート"] },
      { label: "冷却回路", stems: ["冷却"] },
      { label: "保圧", stems: ["保圧"] },
    ],
  },
];

const centerX = (cluster: ClusterDef) => cluster.x + cluster.width / 2;

/**
 * Theme clusters left to right. The theme being viewed is placed next to the
 * organization zone so its story reads in one frame.
 */
export function clusterLayout(caseId: BaseScenarioId): ClusterDef[] {
  const ordered = [
    clusterDefs.find((cluster) => cluster.id === caseId)!,
    ...clusterDefs.filter((cluster) => cluster.id !== caseId),
  ];
  let x = 605;
  return ordered.map((cluster) => {
    const placed = { ...cluster, x };
    x += cluster.width + 15;
    return placed;
  });
}

export type ClusterBounds = {
  id: BaseScenarioId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
const boundsFor = (clusters: ClusterDef[]): ClusterBounds[] =>
  clusters.map((cluster) => ({
    id: cluster.id,
    title: cluster.title,
    x: cluster.x,
    y: 245,
    width: cluster.width,
    height: 760,
  }));

export const zones = [
  {
    id: "org",
    title: "組織 オントロジー",
    sub: "Company / Division / Department / Team / Person",
    x: 20,
    y: 30,
    width: 540,
    height: 990,
  },
  {
    id: "product",
    title: "製品・ナレッジ オントロジー",
    sub: "Knowledge / Domain / Part / Issue / Topic / Document / 登録知見（Merge済みのみ）",
    x: 590,
    y: 30,
    width: 1010,
    height: 990,
  },
] as const;

/** Rough rendered width of a label: full-width characters take 1em. */
export function textWidth(text: string, fontSize: number) {
  let width = 0;
  for (const char of text) {
    width += /[\u0000-ÿ]/.test(char) ? fontSize * 0.58 : fontSize;
  }
  return width;
}

/** Splits a label into at most `maxLines` lines; the last line is shortened. */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines = 2,
) {
  const lines: string[] = [];
  let rest = text;
  while (rest && lines.length < maxLines - 1) {
    let line = "";
    for (const char of rest) {
      if (textWidth(line + char, fontSize) > maxWidth) break;
      line += char;
    }
    if (line === rest) break;
    lines.push(line);
    rest = rest.slice(line.length);
  }
  if (rest) lines.push(fitText(rest, maxWidth, fontSize));
  return lines;
}

export function fitText(text: string, maxWidth: number, fontSize: number) {
  if (textWidth(text, fontSize) <= maxWidth) return text;
  let result = "";
  for (const char of text) {
    if (textWidth(`${result}${char}…`, fontSize) > maxWidth) break;
    result += char;
  }
  return `${result}…`;
}

export const NODE_FONT = { type: 9, title: 12.5, sub: 10 };
export const EDGE_FONT = 10.5;

const expertNodeId = (expertId: number) => `person-${expertId}`;
const personIdByName = (name: string) => {
  const expert = experts.find((item) => item.name === name);
  return expert && [1, 2, 3].includes(expert.id)
    ? expertNodeId(expert.id)
    : undefined;
};

/** Documents worth showing: the search results of every consultation in the demo. */
export const ontologyDocuments: Knowledge[] = (() => {
  const ids: string[] = [];
  for (const scenario of allScenarios) {
    for (const result of retrieveKnowledge(
      scenario.question,
      scenario,
      initialKnowledge,
    ).results) {
      if (!ids.includes(result.item.id)) ids.push(result.item.id);
    }
  }
  return ids.map((id) => initialKnowledge.find((item) => item.id === id)!);
})();

const documentCluster = (item: Knowledge): BaseScenarioId =>
  item.author === "佐藤 美咲"
    ? "welding"
    : item.author === "鈴木 健二"
      ? "molding"
      : "aluminum";

function node(
  partial: Omit<OntologyNode, "facts" | "path" | "desc"> &
    Partial<Pick<OntologyNode, "facts" | "path" | "desc">>,
): OntologyNode {
  return { facts: [], path: "", desc: "", ...partial };
}

function buildBase(caseId: BaseScenarioId): {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
} {
  const clusters = clusterLayout(caseId);
  const clusterOf = (id: BaseScenarioId) =>
    clusters.find((cluster) => cluster.id === id)!;
  const nodes: OntologyNode[] = [];
  const edges: OntologyEdge[] = [];
  const edge = (
    source: string,
    target: string,
    kind: EdgeKind,
    label: string,
    extra: Partial<OntologyEdge> = {},
  ) =>
    edges.push({
      id: `${source}>${target}`,
      source,
      target,
      kind,
      label,
      ...extra,
    });

  // ── Organization ontology (kept from the reference: company → team → person)
  nodes.push(
    node({
      id: "org-company",
      kind: "company",
      layer: "org",
      typeLabel: "Company",
      label: "Manufacturing Co.",
      sub: "架空のデモ企業",
      x: 290,
      y: 120,
      w: 180,
      h: 52,
      path: "Organization",
      desc: "部署・チーム・匠を組織オントロジーとして管理します（架空のデモ企業）。",
    }),
    node({
      id: "org-division",
      kind: "division",
      layer: "org",
      typeLabel: "Division",
      label: "ものづくり事業部",
      sub: "Manufacturing",
      x: 290,
      y: 210,
      w: 170,
      h: 50,
      path: "Organization → ものづくり事業部",
      desc: "製品設計・生産技術・製造技術・品質技術の各部署を束ねる事業部（デモ）。",
    }),
  );
  edge("org-company", "org-division", "structure", "配下");
  const departments = [
    {
      id: "dept-design",
      label: "製品設計部",
      sub: "相談の起票",
      x: 95,
      desc: "設計相談を起票する部署。デモ利用者の山田 太郎が所属します。",
    },
    ...clusterDefs.map((cluster, index) => ({
      id: `dept-${cluster.id}`,
      label: cluster.department,
      sub: `${cluster.team.replace("チーム", "")}を担当`,
      x: 225 + index * 130,
      desc: `${cluster.team}を持ち、${cluster.domain}の相談に対応する部署（デモ）。`,
    })),
  ];
  for (const department of departments) {
    nodes.push(
      node({
        id: department.id,
        kind: "department",
        layer: "org",
        typeLabel: "Department",
        label: department.label,
        sub: department.sub,
        x: department.x,
        y: 310,
        w: 120,
        h: 50,
        path: `Organization → ものづくり事業部 → ${department.label}`,
        desc: department.desc,
      }),
    );
    edge("org-division", department.id, "structure", "配下");
  }
  clusterDefs.forEach((cluster, index) => {
    const expert = experts.find((item) => item.id === cluster.expertId)!;
    const teamId = `team-${cluster.id}`;
    nodes.push(
      node({
        id: teamId,
        kind: "team",
        layer: "org",
        typeLabel: "Team",
        label: cluster.team,
        sub: expert.role.split(" / ")[0],
        x: 225 + index * 130,
        y: 410,
        w: 120,
        h: 50,
        path: `Organization → ${cluster.department} → ${cluster.team}`,
        desc: `${cluster.domain}の工程領域を担当するチーム（デモ）。`,
        facts: [{ label: "担当領域", value: cluster.domain }],
      }),
      node({
        id: expertNodeId(expert.id),
        kind: "person",
        layer: "org",
        typeLabel: "匠 / Person",
        label: expert.name,
        sub: `経験${expert.years}年`,
        x: 225 + index * 130,
        y: 515,
        w: 120,
        h: 54,
        path: `Organization → ${cluster.department} → ${cluster.team} → ${expert.name}`,
        desc: expert.focus,
        facts: [
          { label: "役割", value: expert.role },
          { label: "専門", value: expert.tags.join(" / ") },
        ],
      }),
    );
    edge(`dept-${cluster.id}`, teamId, "structure", "配下");
    edge(expertNodeId(expert.id), teamId, "organization", "所属");
  });

  // ── Product / knowledge ontology
  nodes.push(
    node({
      id: "root",
      kind: "root",
      layer: "process",
      typeLabel: "Knowledge Base",
      label: "製品・工程ナレッジ",
      sub: "Manufacturing Knowledge",
      x: 1095,
      y: 110,
      w: 210,
      h: 54,
      path: "Knowledge",
      desc: `製品設計・工程設計・製造・品質改善のナレッジ全体です。グラフには、デモの相談で検索される${ontologyDocuments.length}件のドキュメントを表示しています。`,
    }),
  );
  for (const cluster of clusters) {
    const cx = centerX(cluster);
    const domainId = `domain-${cluster.id}`;
    const partId = `part-${cluster.id}`;
    nodes.push(
      node({
        id: domainId,
        kind: "domain",
        layer: "process",
        typeLabel: "工程領域",
        label: cluster.domain,
        sub: cluster.team,
        x: cx,
        y: 200,
        w: 150,
        h: 50,
        cluster: cluster.id,
        path: `Knowledge → ${cluster.domain}`,
        desc: `${cluster.domain}の工程領域。担当チーム、対象部品、課題、技術・観点、ドキュメントがつながります。`,
      }),
    );
    edge("root", domainId, "structure", "工程領域");
    edge(`team-${cluster.id}`, domainId, "organization", "担当");
    const multi = cluster.issues.length > 1;
    const partX = multi ? cluster.x + 64 : cx - 72;
    nodes.push(
      node({
        id: partId,
        kind: "part",
        layer: "process",
        typeLabel: "対象部品・形状",
        label: cluster.part.label,
        sub: cluster.part.sub,
        x: partX,
        y: 290,
        w: multi ? 108 : 130,
        h: 48,
        cluster: cluster.id,
        path: `Knowledge → ${cluster.domain} → ${cluster.part.label}`,
        desc: cluster.part.desc,
      }),
    );
    edge(domainId, partId, "structure", "対象部品");
    cluster.issues.forEach((issue, index) => {
      const issueId = `issue-${cluster.id}-${index}`;
      nodes.push(
        node({
          id: issueId,
          kind: "issue",
          layer: "issue",
          typeLabel: "課題",
          label: issue.label,
          sub: issue.sub,
          x: multi ? cluster.x + 182 + index * 118 : cx + 76,
          y: 290,
          w: multi ? 108 : 120,
          h: 48,
          cluster: cluster.id,
          path: `Knowledge → ${cluster.domain} → ${issue.label}`,
          desc: issue.desc,
        }),
      );
      if (index === 0) edge(partId, issueId, "structure", "発生課題");
      else edge(domainId, issueId, "structure", "課題");
    });
    const topicSpacing = cluster.topics.length > 3 ? 88 : 96;
    cluster.topics.forEach((topic, index) => {
      const topicId = `topic-${cluster.id}-${topic.label}`;
      nodes.push(
        node({
          id: topicId,
          kind: "topic",
          layer: "issue",
          typeLabel: "技術・観点",
          label: topic.label,
          x: cx + (index - (cluster.topics.length - 1) / 2) * topicSpacing,
          y: 375,
          w: topicSpacing - 8,
          h: 38,
          cluster: cluster.id,
          path: `Knowledge → ${cluster.domain} → ${topic.label}`,
          desc: `確認観点「${topic.label}」。タグや本文に「${topic.stems.join("・")}」を含むドキュメントと知見がつながります（語の一致で、因果関係ではありません）。`,
        }),
      );
    });
    cluster.issues.forEach((issue, index) => {
      for (const topic of issue.topics) {
        edge(
          `issue-${cluster.id}-${index}`,
          `topic-${cluster.id}-${topic}`,
          "structure",
          "確認観点",
        );
      }
    });
  }
  const columns = new Map<BaseScenarioId, number>();
  for (const item of ontologyDocuments) {
    const cluster = clusterOf(documentCluster(item));
    const index = columns.get(cluster.id) ?? 0;
    columns.set(cluster.id, index + 1);
    const wide = cluster.width > 320;
    const docId = `doc-${item.id}`;
    nodes.push(
      node({
        id: docId,
        kind: "document",
        layer: "document",
        typeLabel: `NOTE · ${item.id}`,
        label: item.title,
        sub: item.author,
        x: centerX(cluster) + (index % 2 === 0 ? -1 : 1) * (wide ? 90 : 73),
        y: 452 + Math.floor(index / 2) * 58,
        w: wide ? 170 : 140,
        h: 46,
        cluster: cluster.id,
        knowledgeId: item.id,
        path: `Knowledge → ${cluster.domain} → Document`,
        desc: item.summary,
        facts: [
          { label: "ID", value: item.id },
          { label: "執筆", value: item.author },
          { label: "日付", value: item.date },
          { label: "タグ", value: item.tags.join(" / ") },
        ],
      }),
    );
    const author = personIdByName(item.author);
    if (author) {
      edge(author, docId, "organization", "執筆", { peripheral: true });
    }
    for (const topic of cluster.topics) {
      const tag = item.tags.find((value) =>
        topic.stems.some((stem) => value.includes(stem)),
      );
      if (tag) {
        edge(docId, `topic-${cluster.id}-${topic.label}`, "tag", `タグ一致：${tag}`);
      }
    }
    cluster.issues.forEach((issue, index) => {
      const tag = item.tags.find((value) =>
        issue.keywords.some((word) => value.includes(word)),
      );
      if (tag) {
        edge(docId, `issue-${cluster.id}-${index}`, "tag", `タグ一致：${tag}`);
      }
    });
  }
  return { nodes, edges };
}

const baseCache = new Map<BaseScenarioId, ReturnType<typeof buildBase>>();
function baseFor(caseId: BaseScenarioId) {
  if (!baseCache.has(caseId)) baseCache.set(caseId, buildBase(caseId));
  return baseCache.get(caseId)!;
}

/** Automatic connections from a saved note to topic nodes of its cluster. */
function topicLinks(item: Knowledge, cluster: ClusterDef) {
  const content = [
    item.title,
    item.summary,
    ...(item.recommendations ?? []).map((r) => `${r.title} ${r.body}`),
  ].join(" ");
  return cluster.topics.flatMap((topic) => {
    const tag = item.tags.find((value) =>
      topic.stems.some((stem) => value.includes(stem)),
    );
    if (tag) return [{ topic, label: `タグ一致：${tag}` }];
    const stem = topic.stems.find((value) => content.includes(value));
    return stem ? [{ topic, label: `本文で言及：${stem}` }] : [];
  });
}

export type OntologyView = {
  stage: OntologyStage;
  clusters: ClusterBounds[];
  /** Approved ontology only: base knowledge plus Merged notes. */
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  /** Merged notes and their relations, marked NEW in ② / ③. */
  newNodeIds: string[];
  newEdgeIds: string[];
  /** ④ only: what the current answer used. Never part of the saved ontology. */
  usedNodeIds: string[];
  usedEdgeIds: string[];
  /** ④ only: temporary lines from the used note to what the answer applied it to. */
  overlayEdges: OntologyEdge[];
  focusNodeId?: string;
  registered: Knowledge[];
  usage?: KnowledgeUsage;
  availability: Record<OntologyStage, boolean>;
  /** Source IDs of the registered knowledge that are not drawn as nodes. */
  hiddenSources: string[];
};

export function defaultStage(
  availability: Record<OntologyStage, boolean>,
): OntologyStage {
  return availability.usage ? "usage" : availability.after ? "after" : "before";
}

/**
 * Builds the ontology for one theme and stage. Only approved (Merged)
 * knowledge becomes part of the graph. Consultations and answers are not
 * stored in it: stage ④ overlays what the current answer used on top of the
 * approved graph. Pure: switching stages never changes the saved knowledge.
 */
export function buildOntology({
  knowledge,
  scenario,
  stage: requestedStage,
  overlay,
}: {
  knowledge: Knowledge[];
  scenario: Scenario;
  stage: OntologyStage;
  /** The current answer's use of registered knowledge (session only). */
  overlay?: KnowledgeUsage | null;
}): OntologyView {
  const baseScenario =
    scenarios.find((item) => item.id === scenario.followUp?.baseScenarioId) ??
    scenarios.find((item) => item.id === scenario.id) ??
    scenarios[0];
  const followUp = followUpOf(baseScenario)!;
  const clusters = clusterLayout(baseScenario.id as BaseScenarioId);
  const cluster = clusters[0];
  const cx = centerX(cluster);
  const base = baseFor(cluster.id);
  const first = cycleOneKnowledge(knowledge, baseScenario);
  const second = cycleTwoKnowledge(knowledge, followUp);
  const usage =
    overlay &&
    first &&
    latestUsageFor([overlay], knowledge, baseScenario) &&
    overlay.usedKnowledge.some((item) => item.id === first.id)
      ? overlay
      : undefined;
  const availability: Record<OntologyStage, boolean> = {
    before: true,
    after: Boolean(first || second),
    focus: Boolean(first || second),
    usage: Boolean(usage),
  };
  const stage = availability[requestedStage] ? requestedStage : "before";
  const nodes = base.nodes.map((item) => ({ ...item }));
  const edges = base.edges.map((item) => ({ ...item }));
  const hasNode = (id: string) => nodes.some((item) => item.id === id);
  const add = (
    source: string,
    target: string,
    kind: EdgeKind,
    label: string,
    extra: Partial<OntologyEdge> = {},
  ) => {
    if (!hasNode(source) || !hasNode(target)) return;
    const id = `${source}>${target}`;
    if (edges.some((item) => item.id === id)) return;
    edges.push({ id, source, target, kind, label, phase: "cycle1", ...extra });
  };
  const issueIds = (label?: string) =>
    cluster.issues.flatMap((issue, index) =>
      !label || issue.label === label ? [`issue-${cluster.id}-${index}`] : [],
    );
  const hiddenSources: string[] = [];
  const knowledgeWidth = Math.min(240, cluster.width - 60);

  const addKnowledgeNode = (
    item: Knowledge,
    id: string,
    y: number,
    x: number,
    w: number,
  ) => {
    const reviewer = item.provenance?.review.reviewer;
    nodes.push(
      node({
        id,
        kind: "knowledge",
        layer: "registered",
        typeLabel: `登録知見 · ${shortId(item.id)}`,
        label: item.title,
        sub: `${item.author} · ${item.date}`,
        x,
        y,
        w,
        h: 74,
        cluster: cluster.id,
        knowledgeId: item.id,
        phase: "cycle1",
        path: `Knowledge → ${cluster.domain} → 登録知見（Merge済み）`,
        desc: item.summary,
        facts: [
          { label: "ID", value: item.id },
          { label: "登録", value: item.date },
          {
            label: "承認",
            value: reviewer
              ? `${reviewer}（模擬レビュー）· Approve後にMerge`
              : "承認記録なし",
          },
          ...(item.conditions
            ? [{ label: "適用条件", value: item.conditions }]
            : []),
          ...(item.provenance
            ? [{ label: "元の相談", value: item.provenance.question }]
            : []),
          { label: "タグ", value: item.tags.join(" / ") },
          ...(item.provenance?.basedOn?.length
            ? [
                {
                  label: "発展元",
                  value: item.provenance.basedOn
                    .map((source) => `${source.title}（${shortId(source.id)}）`)
                    .join(" / "),
                },
              ]
            : []),
        ],
      }),
    );
    const reviewerId = personIdByName(reviewer ?? item.author);
    if (reviewerId) add(reviewerId, id, "approval", "承認（模擬）");
    for (const sourceId of item.provenance?.sourceIds ?? []) {
      // A displayed note is linked by 発展元 instead of 参照.
      if (registered.some((entry) => entry.id === sourceId)) continue;
      if (hasNode(`doc-${sourceId}`)) {
        add(id, `doc-${sourceId}`, "reference", "参照");
      } else {
        hiddenSources.push(sourceId);
      }
    }
    for (const link of topicLinks(item, cluster)) {
      add(id, `topic-${cluster.id}-${link.topic.label}`, "tag", link.label);
    }
  };

  const registered = stage === "before" ? [] : [first, second].filter(
    (item): item is Knowledge => Boolean(item),
  );
  if (stage !== "before") {
    // Two notes sit side by side so neither one's relations run through the other.
    const pair = Boolean(first && second);
    const pairWidth = Math.floor((cluster.width - 20 - 64) / 2);
    const width = pair ? pairWidth : knowledgeWidth;
    const leftX = cluster.x + 10 + pairWidth / 2;
    const rightX = cluster.x + cluster.width - 10 - pairWidth / 2;
    if (first) {
      addKnowledgeNode(first, "knowledge-1", 790, pair ? leftX : cx, width);
      for (const issueId of issueIds(cluster.issues[0].label)) {
        add("knowledge-1", issueId, "structure", "対象課題");
      }
    }
    if (second) {
      addKnowledgeNode(second, "knowledge-2", 790, pair ? rightX : cx, width);
      for (const issueId of issueIds(followUp.followUp!.issue)) {
        add("knowledge-2", issueId, "structure", "対象課題");
      }
      if (
        first &&
        second.provenance?.basedOn?.some((item) => item.id === first.id)
      ) {
        add("knowledge-2", "knowledge-1", "reference", "発展元");
      }
    }
  }

  // ④: highlight what the current answer used; nothing is added to the ontology.
  const usedNodeIds: string[] = [];
  const usedEdgeIds: string[] = [];
  const overlayEdges: OntologyEdge[] = [];
  if (stage === "usage" && usage) {
    usedNodeIds.push("knowledge-1");
    const targets: { id: string; label: string }[] = [
      ...issueIds(followUp.followUp!.issue).map((id) => ({
        id,
        label: "今回の質問に使用",
      })),
      ...usage.checks
        .filter((check) => check.usesKnowledge && check.topic)
        .map((check) => ({
          id: `topic-${cluster.id}-${check.topic}`,
          label: "回答で使用",
        })),
    ];
    for (const target of targets) {
      if (!hasNode(target.id) || usedNodeIds.includes(target.id)) continue;
      usedNodeIds.push(target.id);
      const existing = edges.find(
        (item) =>
          (item.source === "knowledge-1" && item.target === target.id) ||
          (item.target === "knowledge-1" && item.source === target.id),
      );
      if (existing) {
        usedEdgeIds.push(existing.id);
      } else {
        overlayEdges.push({
          id: `overlay:knowledge-1>${target.id}`,
          source: "knowledge-1",
          target: target.id,
          kind: "usage",
          label: target.label,
          used: true,
        });
      }
    }
  }

  const latest = [...registered].sort((a, b) =>
    (b.provenance?.review.mergedAt ?? "").localeCompare(
      a.provenance?.review.mergedAt ?? "",
    ),
  )[0];
  const latestNodeId = latest
    ? latest.id === first?.id
      ? "knowledge-1"
      : "knowledge-2"
    : undefined;
  const marksNew = stage === "after" || stage === "focus";
  return {
    stage,
    clusters: boundsFor(clusters),
    nodes,
    edges,
    newNodeIds: marksNew
      ? nodes.filter((item) => item.phase).map((item) => item.id)
      : [],
    newEdgeIds: marksNew
      ? edges.filter((item) => item.phase).map((item) => item.id)
      : [],
    usedNodeIds,
    usedEdgeIds: [...usedEdgeIds, ...overlayEdges.map((item) => item.id)],
    overlayEdges,
    focusNodeId:
      stage === "focus" ? latestNodeId : stage === "usage" ? "knowledge-1" : undefined,
    registered,
    usage: stage === "usage" ? usage : undefined,
    availability,
    hiddenSources: [...new Set(hiddenSources)],
  };
}

/** Neighbourhood of a node, used for highlighting and auto-fit. */
export function neighbours(view: Pick<OntologyView, "edges">, id: string) {
  const ids = new Set([id]);
  for (const item of view.edges) {
    if (item.source === id) ids.add(item.target);
    if (item.target === id) ids.add(item.source);
  }
  return ids;
}

export type Box = { x: number; y: number; w: number; h: number };

export function boundsOf(nodes: OntologyNode[], padding = 40): Box {
  if (!nodes.length) return { x: 0, y: 0, w: WORLD.width, h: WORLD.height };
  const left = Math.min(...nodes.map((item) => item.x - item.w / 2));
  const right = Math.max(...nodes.map((item) => item.x + item.w / 2));
  const top = Math.min(...nodes.map((item) => item.y - item.h / 2));
  const bottom = Math.max(...nodes.map((item) => item.y + item.h / 2));
  return {
    x: left - padding,
    y: top - padding,
    w: right - left + padding * 2,
    h: bottom - top + padding * 2,
  };
}

/** Nodes the camera should frame for a stage. */
export function stageFrameNodes(view: OntologyView, scenario: Scenario) {
  const baseId = scenario.followUp?.baseScenarioId ?? scenario.id;
  if (view.stage === "before") {
    return view.nodes.filter(
      (item) => item.cluster === baseId || item.layer === "org",
    );
  }
  const ids = new Set<string>();
  const addNeighbourhood = (id: string) =>
    neighbours(view, id).forEach((item) => ids.add(item));
  if (view.stage === "usage") {
    view.usedNodeIds.forEach((id) => ids.add(id));
    addNeighbourhood("knowledge-1");
  } else if (view.focusNodeId) {
    addNeighbourhood(view.focusNodeId);
  } else {
    view.newNodeIds.forEach(addNeighbourhood);
  }
  return view.nodes.filter((item) => ids.has(item.id));
}

export type EdgeGeometry = {
  path: string;
  point: (t: number) => { x: number; y: number };
};

/** Card-to-card cubic curve, vertical or horizontal like the reference links. */
export function edgeGeometry(a: OntologyNode, b: OntologyNode): EdgeGeometry {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const vertical = Math.abs(dy) > Math.abs(dx) * 0.6;
  const p0 = vertical
    ? { x: a.x, y: a.y + Math.sign(dy || 1) * (a.h / 2) }
    : { x: a.x + Math.sign(dx || 1) * (a.w / 2), y: a.y };
  const p3 = vertical
    ? { x: b.x, y: b.y - Math.sign(dy || 1) * (b.h / 2 + 3) }
    : { x: b.x - Math.sign(dx || 1) * (b.w / 2 + 3), y: b.y };
  const p1 = vertical
    ? { x: p0.x, y: (p0.y + p3.y) / 2 }
    : { x: (p0.x + p3.x) / 2, y: p0.y };
  const p2 = vertical
    ? { x: p3.x, y: (p0.y + p3.y) / 2 }
    : { x: (p0.x + p3.x) / 2, y: p3.y };
  const point = (t: number) => {
    const u = 1 - t;
    return {
      x:
        u * u * u * p0.x +
        3 * u * u * t * p1.x +
        3 * u * t * t * p2.x +
        t * t * t * p3.x,
      y:
        u * u * u * p0.y +
        3 * u * u * t * p1.y +
        3 * u * t * t * p2.y +
        t * t * t * p3.y,
    };
  };
  const f = (value: number) => value.toFixed(1);
  return {
    path: `M${f(p0.x)} ${f(p0.y)} C${f(p1.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)} ${f(p3.x)} ${f(p3.y)}`,
    point,
  };
}

const overlaps = (a: Box, b: Box, gap = 2) =>
  a.x < b.x + b.w + gap &&
  b.x < a.x + a.w + gap &&
  a.y < b.y + b.h + gap &&
  b.y < a.y + a.h + gap;

export type LabelPlacement = Box & { edgeId: string; text: string };

/**
 * Places edge labels in priority order, sliding along the curve to avoid
 * nodes and earlier labels. Labels without a free spot are left out of the
 * canvas (they stay listed in the detail panel), so none overlap.
 */
export function placeEdgeLabels(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  fontSize = EDGE_FONT,
  priority: (edge: OntologyEdge) => number = () => 0,
): LabelPlacement[] {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const length = (item: OntologyEdge) => {
    const a = byId.get(item.source);
    const b = byId.get(item.target);
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;
  };
  const place = (ordered: OntologyEdge[]) => {
    const occupied: Box[] = nodes.map((item) => ({
      x: item.x - item.w / 2,
      y: item.y - item.h / 2,
      w: item.w,
      h: item.h,
    }));
    const placed: LabelPlacement[] = [];
    for (const item of ordered) {
      const a = byId.get(item.source);
      const b = byId.get(item.target);
      if (!a || !b) continue;
      const geometry = edgeGeometry(a, b);
      const w = textWidth(item.label, fontSize) + 8;
      const h = fontSize + 6;
      for (const t of LABEL_POSITIONS) {
        const point = geometry.point(t);
        const box = { x: point.x - w / 2, y: point.y - h / 2, w, h };
        if (occupied.some((other) => overlaps(box, other))) continue;
        occupied.push(box);
        placed.push({ ...box, edgeId: item.id, text: item.label });
        break;
      }
    }
    return placed;
  };
  // Greedy placement depends on order, so a few orders are tried (higher
  // priority always first) and the one placing the most important labels wins.
  const tieBreaks: ((a: OntologyEdge, b: OntologyEdge) => number)[] = [
    () => 0,
    (a, b) => length(a) - length(b),
    (a, b) => length(b) - length(a),
  ];
  const score = (result: LabelPlacement[]) =>
    result.reduce((sum, label) => {
      const edge = edges.find((item) => item.id === label.edgeId)!;
      return sum + 1000 ** (5 - Math.min(5, priority(edge)));
    }, 0);
  let best: LabelPlacement[] = [];
  for (const tieBreak of tieBreaks) {
    const result = place(
      [...edges].sort((a, b) => priority(a) - priority(b) || tieBreak(a, b)),
    );
    if (score(result) > score(best)) best = result;
  }
  return best;
}

const LABEL_POSITIONS = [
  0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75, 0.18, 0.82, 0.88, 0.12, 0.92, 0.08,
  0.95, 0.97, 0.03,
];

/** Relation names that carry the story and should win label space. */
export const KEY_RELATIONS = ["発展元", "承認（模擬）", "対象課題", "今回の質問に使用", "回答で使用"];

/** Label priority shared by the views and tests: lower is placed first. */
export function labelPriority(
  view: Pick<OntologyView, "usedEdgeIds" | "newEdgeIds">,
  active: Set<string> = new Set(),
) {
  return (edge: OntologyEdge) =>
    view.usedEdgeIds.includes(edge.id)
      ? 0
      : view.newEdgeIds.includes(edge.id)
        ? KEY_RELATIONS.includes(edge.label)
          ? 1
          : 2
        : active.has(edge.id)
          ? 3
          : 4;
}

export function countSummary(view: OntologyView) {
  return {
    nodes: view.nodes.length,
    links: view.edges.length,
    newNodes: view.newNodeIds.length,
    newLinks: view.newEdgeIds.length,
    usedLinks: view.usedEdgeIds.length,
  };
}

/**
 * Auxiliary layout for the post-merge view: the same nodes and relations as
 * the full ontology, re-arranged around one note so its connections are
 * readable at a glance. Only positions change.
 */
export function egoLayout(
  view: Pick<OntologyView, "nodes" | "edges">,
  focusId: string,
  extraIds: string[] = [],
): { nodes: OntologyNode[]; edges: OntologyEdge[] } {
  const ids = neighbours(view, focusId);
  extraIds.forEach((id) => ids.add(id));
  const focus = view.nodes.find((item) => item.id === focusId);
  if (!focus) return { nodes: [], edges: [] };
  const others = view.nodes.filter(
    (item) => ids.has(item.id) && item.id !== focusId,
  );
  const right = others.filter((item) => item.kind === "document");
  const top = others.filter((item) =>
    ["issue", "topic", "part", "domain", "root"].includes(item.kind),
  );
  const left = others.filter(
    (item) => !right.includes(item) && !top.includes(item),
  );
  const placed: OntologyNode[] = [{ ...focus, x: 0, y: 40 }];
  const column = (items: OntologyNode[], x: number) => {
    const gap = 26;
    const total = items.reduce((sum, item) => sum + item.h + gap, -gap);
    let y = 40 - total / 2;
    for (const item of items) {
      placed.push({ ...item, x, y: y + item.h / 2 });
      y += item.h + gap;
    }
  };
  const row = (items: OntologyNode[], y: number) => {
    const gap = 16;
    const total = items.reduce((sum, item) => sum + item.w + gap, -gap);
    let x = -total / 2;
    for (const item of items) {
      placed.push({ ...item, x: x + item.w / 2, y });
      x += item.w + gap;
    }
  };
  const leftWidth = Math.max(0, ...left.map((item) => item.w));
  const rightWidth = Math.max(0, ...right.map((item) => item.w));
  column(left, -(focus.w / 2 + 120 + leftWidth / 2));
  column(right, focus.w / 2 + 120 + rightWidth / 2);
  const columnsTop = Math.min(
    40 - focus.h / 2,
    ...placed.map((item) => item.y - item.h / 2),
  );
  row(top, columnsTop - 70);
  const placedIds = new Set(placed.map((item) => item.id));
  return {
    nodes: placed,
    edges: view.edges.filter(
      (item) => placedIds.has(item.source) && placedIds.has(item.target),
    ),
  };
}

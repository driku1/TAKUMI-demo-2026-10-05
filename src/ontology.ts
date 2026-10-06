import {
  experts,
  baseScenarioOf,
  followUpOf,
  initialKnowledge,
  scenarios,
  allScenarios,
  type BaseScenarioId,
  type Expert,
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


export type OntologyLayer = "org" | "people" | "process" | "issue" | "document" | "registered";
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
  | "knowledge"
  // Temporary nodes of a consultation step (never part of the ontology).
  | "gap"
  | "question"
  | "answer"
  // Where a question plan row starts: the consultation, or the question an answer replied to.
  | "origin";
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
  cluster?: ClusterId;
  knowledgeId?: string;
  phase?: Phase;
  /** Expected-knowledge previews only: a note that does not exist yet. */
  hypothetical?: boolean;
  /** Temporary items on the whole map: larger text so they stay readable. */
  fontScale?: number;
};

/** Relation families shown in the legend. None of them expresses causation. */
export type EdgeKind =
  | "structure"
  | "organization"
  | "reference"
  | "tag"
  | "approval"
  | "usage"
  | "search"
  | "expected"
  | "plan";

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
  /**
   * elbow: hierarchy drawn like an org chart (down, across, down).
   * side: always leaves and enters cards from the side.
   */
  route?: "elbow" | "side";
};

export type OntologyStage = "before" | "after" | "focus" | "usage";

export const edgeKindLabels: Record<EdgeKind, string> = {
  structure: "構造・包含（配下・対象部品・確認観点）",
  organization: "所属・担当・執筆",
  reference: "参照・出典（参照・発展元）",
  tag: "タグ一致・本文で言及（因果ではない）",
  approval: "承認（Approve review）",
  usage: "今回の回答で使用（④の重ね表示・保存しない）",
  search: "検索語一致（検索結果の一時表示・因果ではない）",
  expected: "インタビュー後の想定（未登録・保存しない）",
  plan: "質問計画（既存知見 → 確認したい点 → 質問・一時表示）",
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
    title: "新知見に注目｜追加した知見と接続先",
    description:
      "追加した知見とその接続先だけを拡大して強調し、ほかは薄く表示します。登録内容と接続先の一覧も表示します。",
  },
  usage: {
    button: "④ 回答での活用",
    title: "回答での活用｜今回の回答が使った登録知見",
    description:
      "表示中の相談の回答が、グラフ内のどの登録知見を使い、どの課題・観点に当てたかを重ねて表示します（USED）。この重ね表示は保存されず、グラフ自体は変わりません。",
  },
};

/** Theme clusters: the three consultation themes and three more expert domains. */
export type ClusterId = BaseScenarioId | "quality" | "automation" | "assembly";

type ClusterDef = {
  id: ClusterId;
  title: string;
  domain: string;
  /** Expert category (Experts page) whose people form the team. */
  category: string;
  team: string;
  department: string;
  part?: { label: string; sub: string; desc: string };
  /** What the theme's consultations are about. Names notes; not drawn as nodes. */
  issues: { label: string; keywords: string[] }[];
  topics: { label: string; stems: string[] }[];
  x: number;
  width: number;
};

const domainDefs: Omit<ClusterDef, "x" | "width">[] = [
  {
    id: "aluminum",
    title: "切削加工",
    domain: "切削加工",
    category: "切削加工",
    team: "精密加工チーム",
    department: "生産技術部",
    part: { label: "薄肉ハウジング", sub: "切削部品の例", desc: "薄肉アルミハウジングの相談例で扱う対象部品です。" },
    issues: [{ label: "加工変形", keywords: ["加工変形"] }],
    topics: [
      { label: "治具設計", stems: ["治具"] },
      { label: "薄肉加工", stems: ["薄肉"] },
      { label: "残留応力", stems: ["残留応力"] },
      { label: "工具摩耗", stems: ["工具", "びびり"] },
      { label: "穴加工", stems: ["穴加工", "ねじ", "ポケット"] },
      { label: "五軸加工", stems: ["五軸"] },
      { label: "研削仕上げ", stems: ["研削", "表面粗さ"] },
      { label: "放電加工", stems: ["放電"] },
    ],
  },
  {
    id: "welding",
    title: "材料・接合",
    domain: "材料・接合",
    category: "材料・接合",
    team: "材料・接合チーム",
    department: "製造技術部",
    part: { label: "ブラケット", sub: "ステンレス製の例", desc: "ステンレス製ブラケットの相談例で扱う対象部品です。" },
    issues: [{ label: "溶接ひずみ", keywords: ["溶接変形", "ひずみ"] }],
    topics: [
      { label: "仮付け", stems: ["仮付け"] },
      { label: "温度管理", stems: ["温度", "入熱"] },
      { label: "接合", stems: ["接合"] },
      { label: "材料選定", stems: ["材料選定", "腐食", "表面処理"] },
      { label: "薄板", stems: ["薄板"] },
      { label: "溶接変形", stems: ["溶接変形"] },
      { label: "熱処理", stems: ["熱処理"] },
      { label: "アルミ合金", stems: ["アルミ合金", "A6061"] },
    ],
  },
  {
    id: "molding",
    title: "金型・成形",
    domain: "金型・成形",
    category: "金型・成形",
    team: "金型・成形チーム",
    department: "品質技術部",
    part: { label: "樹脂カバー", sub: "成形品の例", desc: "樹脂カバーの相談例で扱う対象部品です。" },
    issues: [
      { label: "リブ裏のヒケ", keywords: ["ヒケ"] },
      { label: "量産時の反り", keywords: ["反り"] },
    ],
    topics: [
      { label: "リブ周辺", stems: ["リブ"] },
      { label: "ゲート位置", stems: ["ゲート"] },
      { label: "冷却回路", stems: ["冷却"] },
      { label: "保圧", stems: ["保圧"] },
      { label: "外観", stems: ["外観", "限度見本", "シボ"] },
      { label: "射出成形", stems: ["射出成形"] },
      { label: "金型設計", stems: ["金型設計"] },
      { label: "ダイカスト", stems: ["ダイカスト"] },
      { label: "プレス加工", stems: ["プレス", "スプリングバック"] },
    ],
  },
  {
    id: "quality",
    title: "品質・計測",
    domain: "品質・計測",
    category: "品質・計測",
    team: "品質・計測チーム",
    department: "品質保証部",
    issues: [],
    topics: [
      { label: "測定", stems: ["測定", "検査"] },
      { label: "幾何公差", stems: ["幾何公差", "公差"] },
      { label: "工程能力", stems: ["工程能力", "寸法"] },
      { label: "変化点管理", stems: ["変化点", "再発防止", "受入"] },
    ],
  },
  {
    id: "automation",
    title: "自動化・保全",
    domain: "自動化・保全",
    category: "自動化・保全",
    team: "自動化・保全チーム",
    department: "製造設備部",
    issues: [],
    topics: [
      { label: "予防保全", stems: ["予防保全"] },
      { label: "設備点検", stems: ["設備点検"] },
      { label: "位置決め", stems: ["位置決め", "ロボット"] },
    ],
  },
  {
    id: "assembly",
    title: "生産・組立",
    domain: "生産・組立",
    category: "生産・組立",
    team: "生産・組立チーム",
    department: "製造企画部",
    issues: [],
    topics: [
      { label: "標準作業", stems: ["標準作業", "標準化", "技能伝承"] },
      { label: "段取り", stems: ["段取り"] },
      { label: "工程改善", stems: ["リードタイム", "工程改善", "工程短縮", "手直し"] },
      { label: "組立", stems: ["組立", "作業性"] },
    ],
  },
];

// ── Whole-map layout: three layers from top to bottom — organization,
// people (匠) and product/knowledge — over seven aligned columns: the
// requester's department first, then one column per process domain, so a
// team, its people and its domain's knowledge line up.
const MAP_X = 30;
const COLUMN_WIDTH = 272;
const COLUMN_GAP = 14;
const COLUMNS = domainDefs.length + 1;
const MAP_WIDTH = COLUMNS * (COLUMN_WIDTH + COLUMN_GAP) - COLUMN_GAP;
const MAP_CENTER = MAP_X + MAP_WIDTH / 2;
const columnX = (index: number) => MAP_X + index * (COLUMN_WIDTH + COLUMN_GAP);
const columnCenter = (index: number) => columnX(index) + COLUMN_WIDTH / 2;

// Organization layer: company → division → department → team.
const ORG_TOP = 30;
const COMPANY_Y = 100;
const DIVISION_Y = 180;
const DEPARTMENT_Y = 262;
const TEAM_Y = 342;
const ORG_BOTTOM = 392;
// People layer: everyone under their team, two per row.
const PEOPLE_TOP = ORG_BOTTOM + 18;
const PERSON_Y = PEOPLE_TOP + 92;
const PERSON_STEP = 66;
const PERSON_W = 126;
const PERSON_H = 56;
const teamSize = Math.max(
  ...domainDefs.map((cluster) => experts.filter((expert) => expert.category === cluster.category).length),
);
const PEOPLE_BOTTOM = PERSON_Y + (Math.ceil(teamSize / 2) - 1) * PERSON_STEP + PERSON_H / 2 + 26;
// Knowledge layer: knowledge base → domain → part → topics → Merged notes →
// (expected note of a consultation) → documents.
const KNOWLEDGE_TOP = PEOPLE_BOTTOM + 18;
const ROOT_Y = KNOWLEDGE_TOP + 70;
const DOMAIN_Y = ROOT_Y + 92;
const PART_Y = DOMAIN_Y + 80;
const TOPIC_Y = PART_Y + 76;
const TOPIC_STEP = 88;
const TOPIC_ROW = 48;
const topicRows = Math.max(...domainDefs.map((cluster) => Math.ceil(cluster.topics.length / 3)));

const clusterDefs: ClusterDef[] = domainDefs.map((cluster, index) => ({
  ...cluster,
  x: columnX(index + 1),
  width: COLUMN_WIDTH,
}));

const centerX = (cluster: ClusterDef) => cluster.x + cluster.width / 2;

/** Domain each document is drawn under: the one whose topics its tags name most. */
const authorCategory = (item: Knowledge) =>
  experts.find((expert) => expert.name === item.author)?.category;
function documentCluster(item: Knowledge): ClusterDef {
  const score = (cluster: ClusterDef) =>
    item.tags.filter((tag) =>
      cluster.topics.some((topic) => topic.stems.some((stem) => tag.includes(stem))),
    ).length +
    (item.tags.includes(cluster.category) ? 1 : 0) +
    (authorCategory(item) === cluster.category ? 0.5 : 0);
  return [...clusterDefs].sort((a, b) => score(b) - score(a))[0];
}

/** Every existing note is part of the ontology. */
export const ontologyDocuments: Knowledge[] = initialKnowledge;
const documentsBy = new Map<ClusterId, Knowledge[]>();
for (const item of ontologyDocuments) {
  const cluster = documentCluster(item);
  documentsBy.set(cluster.id, [...(documentsBy.get(cluster.id) ?? []), item]);
}
const docRows = Math.max(
  ...clusterDefs.map((cluster) => Math.ceil((documentsBy.get(cluster.id)?.length ?? 0) / 2)),
);
/** Row of Merged notes, between the topics and the documents. */
export const KNOWLEDGE_Y = TOPIC_Y + (topicRows - 1) * TOPIC_ROW + 18 + 50 + 37;
/**
 * Row under the Merged notes kept for a consultation's temporary expected
 * note (Expert Matching). Never part of the graph.
 */
export const EXPECTED_Y = KNOWLEDGE_Y + 112;
const DOC_TOP = EXPECTED_Y + 52 + 34 + 24;
const DOC_STEP = 58;
const KNOWLEDGE_BOTTOM = DOC_TOP + (docRows - 1) * DOC_STEP + 24 + 34;
export const WORLD = {
  width: MAP_X * 2 + MAP_WIDTH,
  height: KNOWLEDGE_BOTTOM + 20,
};

/** Kept for callers that ordered clusters by theme; the map is fixed now. */
export function clusterLayout(_caseId?: BaseScenarioId): ClusterDef[] {
  return clusterDefs;
}

export type ClusterBounds = {
  id: ClusterId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
/** One stripe per domain, through the people and knowledge layers. */
const boundsFor = (clusters: ClusterDef[]): ClusterBounds[] =>
  clusters.map((cluster) => ({
    id: cluster.id,
    title: cluster.title,
    x: cluster.x,
    y: PEOPLE_TOP + 10,
    width: cluster.width,
    height: KNOWLEDGE_BOTTOM - 10 - (PEOPLE_TOP + 10),
  }));

export const zones = [
  {
    id: "org",
    title: "組織 オントロジー",
    sub: "Company / Division / Department / Team",
    x: MAP_X - 15,
    y: ORG_TOP,
    width: MAP_WIDTH + 30,
    height: ORG_BOTTOM - ORG_TOP,
  },
  {
    id: "people",
    title: "匠 オントロジー（人）",
    sub: `匠${experts.length}名と相談者 · 所属チームの下`,
    x: MAP_X - 15,
    y: PEOPLE_TOP,
    width: MAP_WIDTH + 30,
    height: PEOPLE_BOTTOM - PEOPLE_TOP,
  },
  {
    id: "product",
    title: "製品・ナレッジ オントロジー",
    sub: "Knowledge / Domain / Part / Topic / 登録知見（Merge済みのみ） / Document",
    x: MAP_X - 15,
    y: KNOWLEDGE_TOP,
    width: MAP_WIDTH + 30,
    height: KNOWLEDGE_BOTTOM - KNOWLEDGE_TOP,
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
export const personIdByName = (name: string) => {
  const expert = experts.find((item) => item.name === name);
  return expert ? expertNodeId(expert.id) : undefined;
};
export const topicNodeId = (clusterId: ClusterId, label: string) =>
  `topic-${clusterId}-${label}`;

function node(
  partial: Omit<OntologyNode, "facts" | "path" | "desc"> &
    Partial<Pick<OntologyNode, "facts" | "path" | "desc">>,
): OntologyNode {
  return { facts: [], path: "", desc: "", ...partial };
}

const stageOf = (item: Knowledge) =>
  ["製品設計", "工程設計", "製造", "品質改善"].find((stage) => item.tags.includes(stage));

function buildBase(): {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
} {
  const nodes: OntologyNode[] = [];
  const edges: OntologyEdge[] = [];
  const edge = (
    source: string,
    target: string,
    kind: EdgeKind,
    label: string,
    extra: Partial<OntologyEdge> = {},
  ) => {
    const id = `${source}>${target}`;
    if (edges.some((item) => item.id === id)) return;
    edges.push({ id, source, target, kind, label, ...extra });
  };
  // ── Organization layer: company → division → department → team
  nodes.push(
    node({
      id: "org-company",
      kind: "company",
      layer: "org",
      typeLabel: "Company",
      label: "Manufacturing Co.",
      sub: "架空のデモ企業",
      x: MAP_CENTER,
      y: COMPANY_Y,
      w: 200,
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
      sub: `部署${COLUMNS}・匠${experts.length}名`,
      x: MAP_CENTER,
      y: DIVISION_Y,
      w: 190,
      h: 50,
      path: "Organization → ものづくり事業部",
      desc: "製品設計・生産技術・製造技術・品質・設備・生産企画の各部署を束ねる事業部（デモ）。",
    }),
  );
  edge("org-company", "org-division", "structure", "配下");
  const departments = [
    {
      id: "dept-design",
      label: "製品設計部",
      sub: "相談の起票",
      team: { id: "team-design", label: "設計チーム", sub: "相談者" },
      people: [] as typeof experts,
      desc: "設計相談を起票する部署。デモ利用者の山田 太郎が所属します。",
    },
    ...clusterDefs.map((cluster) => ({
      id: `dept-${cluster.id}`,
      label: cluster.department,
      sub: `${cluster.category}を担当`,
      team: { id: `team-${cluster.id}`, label: cluster.team, sub: "" },
      people: experts.filter((expert) => expert.category === cluster.category),
      desc: `${cluster.team}を持ち、${cluster.domain}の相談に対応する部署（デモ）。`,
    })),
  ];
  departments.forEach((department, index) => {
    const x = columnCenter(index);
    nodes.push(
      node({
        id: department.id,
        kind: "department",
        layer: "org",
        typeLabel: "Department",
        label: department.label,
        sub: department.sub,
        x,
        y: DEPARTMENT_Y,
        w: 200,
        h: 50,
        path: `Organization → ものづくり事業部 → ${department.label}`,
        desc: department.desc,
      }),
      node({
        id: department.team.id,
        kind: "team",
        layer: "org",
        typeLabel: "Team",
        label: department.team.label,
        sub: department.team.sub || `匠 ${department.people.length}名`,
        x,
        y: TEAM_Y,
        w: 200,
        h: 50,
        path: `Organization → ${department.label} → ${department.team.label}`,
        desc: `${department.label}のチーム（デモ）。`,
      }),
    );
    edge("org-division", department.id, "structure", "配下", { route: "elbow" });
    edge(department.id, department.team.id, "structure", "配下");

    // ── People layer: the team's people, two per row
    const people =
      department.id === "dept-design"
        ? [{ id: "person-requester", name: "山田 太郎", sub: "相談者 · 製品設計", role: "製品設計部 / 設計チーム", focus: "設計相談の起票者（デモ利用者）。", tags: [] as string[], years: 0 }]
        : department.people.map((expert) => ({
            id: expertNodeId(expert.id),
            name: expert.name,
            sub: `${expert.role.split(" / ")[0]} · ${expert.years}年`,
            role: expert.role,
            focus: expert.focus,
            tags: expert.tags,
            years: expert.years,
          }));
    people.forEach((person, order) => {
      const single = people.length === 1;
      nodes.push(
        node({
          id: person.id,
          kind: "person",
          layer: "people",
          typeLabel: department.id === "dept-design" ? "相談者 / Person" : "匠 / Person",
          label: person.name,
          sub: person.sub,
          x: single ? x : x + (order % 2 === 0 ? -1 : 1) * (PERSON_W / 2 + 5),
          y: PERSON_Y + Math.floor(order / 2) * PERSON_STEP,
          w: PERSON_W,
          h: PERSON_H,
          path: `Organization → ${department.label} → ${department.team.label} → ${person.name}`,
          desc: person.focus,
          facts: [
            { label: "役割", value: person.role },
            ...(person.years ? [{ label: "経験", value: `${person.years}年` }] : []),
            ...(person.tags.length ? [{ label: "専門", value: person.tags.join(" / ") }] : []),
          ],
        }),
      );
      edge(person.id, department.team.id, "organization", "所属");
    });
  });

  // ── Knowledge layer: knowledge → domain → part → topic, documents
  nodes.push(
    node({
      id: "root",
      kind: "root",
      layer: "process",
      typeLabel: "Knowledge Base",
      label: "製品・工程ナレッジ",
      sub: `ナレッジ${ontologyDocuments.length}件・工程領域${clusterDefs.length}`,
      x: MAP_CENTER,
      y: ROOT_Y,
      w: 230,
      h: 54,
      path: "Knowledge",
      desc: `製品設計・工程設計・製造・品質改善のナレッジ全体です。既存ナレッジ${ontologyDocuments.length}件と、人が承認してMergeした登録知見がつながります。`,
    }),
  );
  for (const cluster of clusterDefs) {
    const cx = centerX(cluster);
    const domainId = `domain-${cluster.id}`;
    const documents = documentsBy.get(cluster.id) ?? [];
    nodes.push(
      node({
        id: domainId,
        kind: "domain",
        layer: "process",
        typeLabel: "工程領域",
        label: cluster.domain,
        sub: `${cluster.team} · ナレッジ${documents.length}件`,
        x: cx,
        y: DOMAIN_Y,
        w: 200,
        h: 50,
        cluster: cluster.id,
        path: `Knowledge → ${cluster.domain}`,
        desc: `${cluster.domain}の工程領域。担当チーム、対象部品、技術・観点、ドキュメントがつながります。`,
      }),
    );
    edge("root", domainId, "structure", "工程領域", { route: "elbow" });
    edge(`team-${cluster.id}`, domainId, "organization", "担当");
    let topicParent = domainId;
    if (cluster.part) {
      const partId = `part-${cluster.id}`;
      nodes.push(
        node({
          id: partId,
          kind: "part",
          layer: "process",
          typeLabel: "対象部品・形状",
          label: cluster.part.label,
          sub: cluster.part.sub,
          x: cx,
          y: PART_Y,
          w: 160,
          h: 46,
          cluster: cluster.id,
          path: `Knowledge → ${cluster.domain} → ${cluster.part.label}`,
          desc: cluster.part.desc,
        }),
      );
      edge(domainId, partId, "structure", "対象部品");
      topicParent = partId;
    }
    cluster.topics.forEach((topic, index) => {
      const row = Math.floor(index / 3);
      const inRow = Math.min(3, cluster.topics.length - row * 3);
      const column = index % 3;
      const id = topicNodeId(cluster.id, topic.label);
      nodes.push(
        node({
          id,
          kind: "topic",
          layer: "issue",
          typeLabel: "技術・観点",
          label: topic.label,
          x: cx + (column - (inRow - 1) / 2) * TOPIC_STEP,
          y: TOPIC_Y + row * TOPIC_ROW,
          w: TOPIC_STEP - 8,
          h: 36,
          cluster: cluster.id,
          path: `Knowledge → ${cluster.domain} → ${topic.label}`,
          desc: `確認観点「${topic.label}」。タグや本文に「${topic.stems.join("・")}」を含むドキュメントと知見、この分野が専門の匠がつながります（語の一致で、因果関係ではありません）。`,
        }),
      );
      edge(topicParent, id, "structure", "確認観点");
    });
    documents.forEach((item, index) => {
      const docId = `doc-${item.id}`;
      const stage = stageOf(item);
      nodes.push(
        node({
          id: docId,
          kind: "document",
          layer: "document",
          typeLabel: `NOTE · ${item.id}`,
          label: item.title,
          sub: `${stage ? `${stage} · ` : ""}${item.author}`,
          x: cx + (index % 2 === 0 ? -1 : 1) * 66,
          y: DOC_TOP + Math.floor(index / 2) * DOC_STEP,
          w: 126,
          h: 48,
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
    });
  }

  // ── Relations across the map (word matches and people; none are causal)
  for (const item of ontologyDocuments) {
    const docId = `doc-${item.id}`;
    const home = documentCluster(item);
    const author = personIdByName(item.author);
    if (author) edge(author, docId, "organization", "執筆", { peripheral: true });
    for (const cluster of clusterDefs) {
      for (const topic of cluster.topics) {
        const tag = item.tags.find((value) =>
          topic.stems.some((stem) => value.includes(stem)),
        );
        if (tag) {
          edge(docId, topicNodeId(cluster.id, topic.label), "tag", `タグ一致：${tag}`, {
            peripheral: cluster.id !== home.id,
          });
        }
      }
    }
  }
  for (const expert of experts) {
    for (const cluster of clusterDefs) {
      for (const topic of cluster.topics) {
        const tag = expert.tags.find((value) =>
          topic.stems.some((stem) => value.includes(stem)),
        );
        if (tag) {
          edge(expertNodeId(expert.id), topicNodeId(cluster.id, topic.label), "organization", "専門", {
            peripheral: true,
          });
        }
      }
    }
  }
  return { nodes, edges };
}

let baseCache: ReturnType<typeof buildBase> | undefined;
function baseFor(_caseId?: BaseScenarioId) {
  baseCache ??= buildBase();
  return baseCache;
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
  const clusters = clusterLayout();
  const cluster = clusters.find((item) => item.id === baseScenario.id)!;
  const cx = centerX(cluster);
  const base = baseFor();
  const first = cycleOneKnowledge(knowledge, baseScenario);
  const second = cycleTwoKnowledge(knowledge, followUp);
  // Registered notes are drawn as knowledge-1 (the theme's first consultation)
  // and knowledge-2 (its related consultation).
  const knowledgeNodeId = (id: string) =>
    id === first?.id ? "knowledge-1" : id === second?.id ? "knowledge-2" : undefined;
  const usage =
    overlay &&
    latestUsageFor([overlay], knowledge, baseScenario) &&
    overlay.usedKnowledge.every((item) => knowledgeNodeId(item.id))
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
      addKnowledgeNode(first, "knowledge-1", KNOWLEDGE_Y, pair ? leftX : cx, width);
    }
    if (second) {
      addKnowledgeNode(second, "knowledge-2", KNOWLEDGE_Y, pair ? rightX : cx, width);
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
    const sourceNode = (source: KnowledgeUsage["checks"][number]["sources"][number]) =>
      source.kind === "knowledge"
        ? knowledgeNodeId(source.knowledgeId)
        : source.kind === "document"
          ? `doc-${source.knowledgeId}`
          : undefined;
    const sources = [
      ...new Set(
        usage.checks.flatMap((check) =>
          check.sources.map(sourceNode).filter((id): id is string => Boolean(id && hasNode(id))),
        ),
      ),
    ];
    usedNodeIds.push(...sources);
    const links: { source: string; target: string; label: string }[] = [];
    for (const check of usage.checks) {
      if (!check.topic) continue;
      for (const source of check.sources.map(sourceNode)) {
        if (source && hasNode(source)) {
          links.push({
            source,
            target: `topic-${cluster.id}-${check.topic}`,
            label: "回答で使用",
          });
        }
      }
    }
    for (const link of links) {
      if (!hasNode(link.target)) continue;
      if (!usedNodeIds.includes(link.target)) usedNodeIds.push(link.target);
      const existing = edges.find(
        (item) =>
          (item.source === link.source && item.target === link.target) ||
          (item.target === link.source && item.source === link.target),
      );
      if (existing) {
        if (!usedEdgeIds.includes(existing.id)) usedEdgeIds.push(existing.id);
      } else if (
        !overlayEdges.some(
          (item) => item.source === link.source && item.target === link.target,
        )
      ) {
        overlayEdges.push({
          id: `overlay:${link.source}>${link.target}`,
          source: link.source,
          target: link.target,
          kind: "usage",
          label: link.label,
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
      stage === "focus"
        ? latestNodeId
        : stage === "usage" && usage
          ? knowledgeNodeId(usage.usedKnowledge[0].id)
          : undefined,
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
  // ① and ② show the whole map; ③ and ④ zoom into the knowledge.
  if (view.stage === "before" || view.stage === "after") return view.nodes;
  const ids = new Set<string>();
  const addNeighbourhood = (id: string) =>
    neighbours(view, id).forEach((item) => ids.add(item));
  if (view.stage === "usage") {
    view.usedNodeIds.forEach((id) => ids.add(id));
    if (view.focusNodeId) addNeighbourhood(view.focusNodeId);
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
export function edgeGeometry(
  a: OntologyNode,
  b: OntologyNode,
  route?: OntologyEdge["route"],
): EdgeGeometry {
  if (route === "elbow" && Math.abs(b.x - a.x) > 1) return elbowGeometry(a, b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const vertical = route !== "side" && Math.abs(dy) > Math.abs(dx) * 0.6;
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

/**
 * Parent above, child below: down to a bus just above the child row, across,
 * then down, so lines to far children never cross the children in between.
 */
function elbowGeometry(a: OntologyNode, b: OntologyNode): EdgeGeometry {
  const top = a.y + a.h / 2;
  const bottom = b.y - b.h / 2 - 3;
  const bus = bottom - Math.min(24, (bottom - top) / 2);
  const points = [
    { x: a.x, y: top },
    { x: a.x, y: bus },
    { x: b.x, y: bus },
    { x: b.x, y: bottom },
  ];
  const lengths = points.slice(1).map((point, index) =>
    Math.hypot(point.x - points[index].x, point.y - points[index].y),
  );
  const total = lengths.reduce((sum, value) => sum + value, 0) || 1;
  const point = (t: number) => {
    let rest = t * total;
    for (const [index, length] of lengths.entries()) {
      if (rest <= length || index === lengths.length - 1) {
        const ratio = length ? Math.min(1, rest / length) : 0;
        const from = points[index];
        const to = points[index + 1];
        return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      }
      rest -= length;
    }
    return points[3];
  };
  const r = Math.min(8, Math.abs(b.x - a.x) / 2, (bus - top) / 2);
  const dir = Math.sign(b.x - a.x);
  const f = (value: number) => value.toFixed(1);
  return {
    path:
      `M${f(a.x)} ${f(top)} V${f(bus - r)} Q${f(a.x)} ${f(bus)} ${f(a.x + dir * r)} ${f(bus)}` +
      ` H${f(b.x - dir * r)} Q${f(b.x)} ${f(bus)} ${f(b.x)} ${f(bus + r)} V${f(bottom)}`,
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
      const geometry = edgeGeometry(a, b, item.route);
      const w = textWidth(item.label, fontSize) + 8;
      const h = fontSize + 6;
      // On the line first; in crowded areas, just beside it.
      const shifts = [
        [0, 0],
        [0, -h - 2],
        [0, h + 2],
        [-w / 2 - 4, 0],
        [w / 2 + 4, 0],
      ];
      search: for (const [dx, dy] of shifts) {
        for (const t of LABEL_POSITIONS) {
          const point = geometry.point(t);
          const box = { x: point.x - w / 2 + dx, y: point.y - h / 2 + dy, w, h };
          if (occupied.some((other) => overlaps(box, other))) continue;
          occupied.push(box);
          placed.push({ ...box, edgeId: item.id, text: item.label });
          break search;
        }
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
export const KEY_RELATIONS = ["発展元", "承認（模擬）", "回答で使用"];

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

/**
 * A focused drawing of part of the approved ontology for one step of a
 * consultation, plus temporary lines that are never saved: search hits
 * (Knowledge Search) or an expected note (Expert Matching).
 */
export type OntologyProjection = {
  key: string;
  tone: "search" | "expected" | "plan";
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  emphasisNodeIds: string[];
  emphasisEdgeIds: string[];
  /** Short text shown on a node's corner (想定, 参照). */
  badges: Record<string, string>;
  caption: string;
  stats: string;
};

type Retrieval = ReturnType<typeof retrieveKnowledge>;

const clusterDefOf = (scenario: Scenario) =>
  clusterDefs.find((item) => item.id === baseScenarioOf(scenario).id)!;

/** What the question is about (names the expected note; not a graph node). */
const askedIssue = (cluster: ClusterDef, scenario: Scenario) =>
  scenario.followUp?.issue ?? cluster.issues[0].label;

/**
 * Ontology node a search term belongs to: a 技術・観点 whose stem it contains,
 * else a 課題 whose keyword matches, else the theme's 工程領域.
 */
export function conceptForTerm(cluster: ClusterDef, term: string): string {
  const topic = cluster.topics.find((item) =>
    item.stems.some((stem) => term.includes(stem)),
  );
  if (topic) return `topic-${cluster.id}-${topic.label}`;
  return `domain-${cluster.id}`;
}

const unique = <T,>(items: T[]) => [...new Set(items)];

export type RetrievalProjection = OntologyProjection & {
  /** Search term → the node it was drawn to. */
  terms: { term: string; nodeId: string; label: string; typeLabel: string }[];
  /** Results without a node in this theme's graph (listed, not drawn). */
  outside: { rank: number; id: string; title: string }[];
  /** Theme-wide words shown on the cards instead of as lines. */
  themeTerms: string[];
  /** Node id of each drawn result, by knowledge ID. */
  hitNodeIds: Record<string, string>;
};

/**
 * Knowledge Search: the retrieved notes on the approved ontology. Concepts
 * (課題・観点・工程領域) are on the left, results on the right in rank order.
 * A result is linked to the concept of each matched term: an approved
 * relation between them is highlighted, otherwise a temporary 検索語一致
 * line is drawn. Word matches only; nothing here expresses causation.
 */
export function retrievalProjection({
  knowledge,
  scenario,
  retrieval,
}: {
  knowledge: Knowledge[];
  scenario: Scenario;
  retrieval: Retrieval;
}): RetrievalProjection {
  const view = buildOntology({ knowledge, scenario, stage: "after" });
  const cluster = clusterDefOf(scenario);
  const byId = new Map(view.nodes.map((item) => [item.id, item]));
  const hits = retrieval.results.map((result, index) => ({
    result,
    rank: index + 1,
    nodeId: view.nodes.find(
      (item) =>
        (item.kind === "document" || item.kind === "knowledge") &&
        item.knowledgeId === result.item.id,
    )?.id,
  }));
  const drawn = hits.filter((hit) => hit.nodeId);
  const conceptTerms = new Map<string, string[]>();
  const links = new Map<string, { note: string; concept: string; terms: string[] }>();
  const domainId = `domain-${cluster.id}`;
  for (const hit of drawn) {
    const concepts = hit.result.matched.map((term) => ({
      term,
      concept: conceptForTerm(cluster, term),
    }));
    // Theme-wide words (射出成形 …) go to the 工程領域 only when nothing more
    // specific matched, so they do not crowd the drawing; the card lists them.
    const specific = concepts.some((item) => item.concept !== domainId);
    for (const { term, concept } of concepts) {
      if (specific && concept === domainId) continue;
      conceptTerms.set(concept, unique([...(conceptTerms.get(concept) ?? []), term]));
      const key = `${hit.nodeId}>${concept}`;
      const link = links.get(key) ?? { note: hit.nodeId!, concept, terms: [] };
      link.terms = unique([...link.terms, term]);
      links.set(key, link);
    }
  }
  const rankOf = new Map(drawn.map((hit) => [hit.nodeId!, hit.rank]));
  const barycenter = (id: string) => {
    const ranks = [...links.values()]
      .filter((link) => link.concept === id)
      .map((link) => rankOf.get(link.note)!);
    return ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
  };
  const conceptIds = [...conceptTerms.keys()]
    .filter((id) => byId.has(id))
    .sort((a, b) => barycenter(a) - barycenter(b));

  // Results in rank order on the right, concepts next to the results they explain.
  const noteWidth = 236;
  const conceptWidth = 160;
  const noteX = conceptWidth / 2 + 250 + noteWidth / 2;
  const nodes: OntologyNode[] = [];
  const noteY = new Map<string, number>();
  let y = 0;
  for (const hit of drawn) {
    const source = byId.get(hit.nodeId!)!;
    const h = source.kind === "knowledge" ? 74 : 50;
    nodes.push({
      ...source,
      x: noteX,
      y: y + h / 2,
      w: noteWidth,
      h,
      sub: `一致：${hit.result.matched.join("・")}`,
    });
    noteY.set(source.id, y + h / 2);
    y += h + 14;
  }
  let bottom = -Infinity;
  for (const id of conceptIds) {
    const source = byId.get(id)!;
    const ys = [...links.values()]
      .filter((link) => link.concept === id)
      .map((link) => noteY.get(link.note)!);
    const target = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 26;
    const h = 52;
    const cy = Math.max(target, bottom + 22 + h / 2);
    bottom = cy + h / 2;
    const terms = conceptTerms.get(id);
    nodes.push({
      ...source,
      x: 0,
      y: cy,
      w: conceptWidth,
      h,
      sub: `検索語：${(terms ?? []).join("・")}`,
    });
  }

  const nodeIds = new Set(nodes.map((item) => item.id));
  const noteIds = new Set(drawn.map((hit) => hit.nodeId!));
  const edges: OntologyEdge[] = [];
  const emphasisEdgeIds: string[] = [];
  for (const link of links.values()) {
    if (!nodeIds.has(link.concept)) continue;
    const existing = view.edges.find(
      (item) =>
        (item.source === link.note && item.target === link.concept) ||
        (item.target === link.note && item.source === link.concept),
    );
    if (existing) {
      edges.push({ ...existing, peripheral: false });
      emphasisEdgeIds.push(existing.id);
    } else {
      const id = `search:${link.note}>${link.concept}`;
      edges.push({
        id,
        source: link.note,
        target: link.concept,
        kind: "search",
        label: `検索語一致：${link.terms.join("・")}`,
      });
      emphasisEdgeIds.push(id);
    }
  }
  // Other approved relations between a result and a drawn concept.
  for (const item of view.edges) {
    if (edges.some((edge) => edge.id === item.id)) continue;
    const crosses =
      (noteIds.has(item.source) && conceptIds.includes(item.target)) ||
      (conceptIds.includes(item.source) && noteIds.has(item.target));
    if (crosses) edges.push({ ...item, peripheral: false });
  }

  const badges: Record<string, string> = {};
  const outside = hits
    .filter((hit) => !hit.nodeId)
    .map((hit) => ({ rank: hit.rank, id: hit.result.item.id, title: hit.result.item.title }));
  return {
    key: `search:${scenario.id}:${retrieval.results.map((result) => result.item.id).join(",")}`,
    tone: "search",
    nodes,
    edges,
    emphasisNodeIds: [...noteIds, ...conceptTerms.keys()].filter((id) => nodeIds.has(id)),
    emphasisEdgeIds,
    badges,
    caption: "検索結果の位置",
    stats: `検索結果${retrieval.results.length}件（グラフ上${drawn.length}件）· 語の一致${links.size}本（一時表示）`,
    themeTerms: unique(
      drawn.flatMap((hit) =>
        hit.result.matched.filter(
          (term) => conceptForTerm(cluster, term) === domainId,
        ),
      ),
    ).filter((term) => !conceptTerms.get(domainId)?.includes(term)),
    terms: [...conceptTerms.entries()].flatMap(([nodeId, terms]) =>
      terms.map((term) => ({
        term,
        nodeId,
        label: byId.get(nodeId)?.label ?? nodeId,
        typeLabel: byId.get(nodeId)?.typeLabel ?? "",
      })),
    ),
    outside,
    hitNodeIds: Object.fromEntries(
      drawn.map((hit) => [hit.result.item.id, hit.nodeId!]),
    ),
  };
}

export type ExpertCandidate = {
  expert: Expert;
  /** The expert's 専門領域 tags that are also search terms. */
  matched: string[];
  /** Retrieved notes the expert wrote. */
  sources: { item: Knowledge }[];
  selected: boolean;
};

export type PlannedQuestion = {
  id: string;
  text: string;
  purpose: string;
  trigger: string;
  origin: string;
};

export type QuestionPlanRow = {
  question: PlannedQuestion;
  unknown: string;
  topics: string[];
  notes: { id: string; title: string; summary: string; rank: number }[];
  answer?: { label: string; text: string };
};

export type QuestionPlanProjection = OntologyProjection & {
  rows: QuestionPlanRow[];
};

/**
 * Question Plan: why each question was generated. Retrieved notes it was
 * based on are highlighted (same nodes as the ontology); what is still
 * unknown and the generated question are temporary nodes. The first
 * question comes from the search results' gap, later ones from the expert's
 * previous answer and the note closest to the question's topics. Nothing is
 * saved or registered as knowledge.
 */
export function questionPlanProjection({
  knowledge,
  scenario,
  retrieval,
  questions,
}: {
  knowledge: Knowledge[];
  scenario: Scenario;
  retrieval: Retrieval;
  questions: PlannedQuestion[];
}): QuestionPlanProjection {
  const view = buildOntology({ knowledge, scenario, stage: "after" });
  const cluster = clusterDefOf(scenario);
  const byId = new Map(view.nodes.map((item) => [item.id, item]));
  const expert = experts.find((item) => item.id === scenario.expertId);
  const hits = retrieval.results.flatMap((result, index) => {
    const nodeId = view.nodes.find(
      (item) =>
        (item.kind === "document" || item.kind === "knowledge") &&
        item.knowledgeId === result.item.id,
    )?.id;
    return nodeId ? [{ item: result.item, rank: index + 1, nodeId }] : [];
  });
  const used = new Set<string>();
  const rows: (QuestionPlanRow & { noteIds: string[]; answerIndex?: number })[] =
    questions.map((question, index) => {
      const first = index === 0;
      const unknown = first ? scenario.gap : question.purpose;
      const focus = first ? `${scenario.gap} ${question.text}` : `${question.text} ${question.trigger}`;
      const topics = cluster.topics.filter((topic) =>
        topic.stems.some((stem) => focus.includes(stem)),
      );
      const words = [
        ...topics.flatMap((topic) => topic.stems),
        ...cluster.issues.flatMap((issue) =>
          issue.keywords.filter((word) => focus.includes(word)),
        ),
      ];
      const score = (item: Knowledge) =>
        words.filter((word) =>
          `${item.title} ${item.summary} ${item.tags.join(" ")}`.includes(word),
        ).length;
      const ranked = hits
        .map((hit) => ({ ...hit, score: score(hit.item) }))
        .filter((hit) => hit.score > 0)
        .sort(
          (a, b) =>
            Number(used.has(a.nodeId)) - Number(used.has(b.nodeId)) ||
            b.score - a.score ||
            a.rank - b.rank,
        );
      const picked = ranked.slice(0, first ? 2 : 1);
      // The first question always rests on what the search returned.
      if (first && !picked.length && hits.length) picked.push({ ...hits[0], score: 0 });
      picked.forEach((hit) => used.add(hit.nodeId));
      const answerIndex = first
        ? undefined
        : scenario.dialogue.findIndex((message) => message.text === question.trigger);
      return {
        question,
        unknown,
        topics: topics.map((topic) => topic.label),
        notes: picked.map((hit) => ({
          id: hit.item.id,
          title: hit.item.title,
          summary: hit.item.summary,
          rank: hit.rank,
        })),
        noteIds: picked.map((hit) => hit.nodeId),
        ...(answerIndex !== undefined && answerIndex >= 0
          ? {
              answerIndex,
              answer: {
                label: question.origin.split("：")[0],
                text: question.trigger,
              },
            }
          : {}),
      };
    });

  // Columns: what was known (notes, answers) → still unknown → question.
  const columnX = 330;
  const nodes: OntologyNode[] = [];
  const edges: OntologyEdge[] = [];
  const temporary = (
    id: string,
    kind: NodeKind,
    typeLabel: string,
    label: string,
    sub: string | undefined,
    x: number,
    y: number,
  ) =>
    node({ id, kind, layer: "issue", typeLabel, label, sub, x, y, w: 230, h: 74, hypothetical: true });
  let bottom = -Infinity;
  const leftY = new Map<string, number>();
  const placeLeft = (item: OntologyNode, h: number) => {
    const y = (Number.isFinite(bottom) ? bottom + 18 : 0) + h / 2;
    bottom = y + h / 2;
    nodes.push({ ...item, x: -columnX, y, w: 230, h });
    leftY.set(item.id, y);
    return y;
  };
  let rowBottom = -Infinity;
  for (const row of rows) {
    const sourceYs: number[] = [];
    for (const id of row.noteIds) {
      if (leftY.has(id)) {
        sourceYs.push(leftY.get(id)!);
        continue;
      }
      const source = byId.get(id)!;
      sourceYs.push(placeLeft(source, source.kind === "knowledge" ? 74 : 56));
    }
    if (row.answer && row.answerIndex !== undefined) {
      const answerId = `answer-${row.question.id}`;
      sourceYs.push(
        placeLeft(
          temporary(
            answerId,
            "answer",
            `${row.answer.label} · ${expert?.name ?? "匠"}の回答（対話）`,
            row.answer.text,
            undefined,
            0,
            0,
          ),
          74,
        ),
      );
    }
    const target = sourceYs.length
      ? sourceYs.reduce((a, b) => a + b, 0) / sourceYs.length
      : 37;
    const y = Number.isFinite(rowBottom) ? Math.max(target, rowBottom + 22 + 37) : target;
    rowBottom = y + 37;
    const gapId = `gap-${row.question.id}`;
    const questionId = `question-${row.question.id}`;
    nodes.push(
      temporary(
        gapId,
        "gap",
        "確認したい点（一時表示）",
        row.unknown,
        row.topics.length ? `観点：${row.topics.join("・")}` : undefined,
        0,
        y,
      ),
      temporary(
        questionId,
        "question",
        `${row.question.id} · 生成した質問（一時表示）`,
        row.question.text,
        undefined,
        columnX,
        y,
      ),
    );
    for (const id of row.noteIds) {
      edges.push({ id: `plan:${id}>${gapId}`, source: id, target: gapId, kind: "plan", label: "参照した既存知見" });
    }
    if (row.answer) {
      edges.push({
        id: `plan:answer-${row.question.id}>${gapId}`,
        source: `answer-${row.question.id}`,
        target: gapId,
        kind: "plan",
        label: "直前の回答",
      });
    }
    edges.push({ id: `plan:${gapId}>${questionId}`, source: gapId, target: questionId, kind: "plan", label: "質問を生成" });
  }

  // One step further back: the consultation the notes were retrieved for,
  // and the question each answer replied to (shown again in that row).
  const originX = -columnX - 115 - 70 - 100;
  const origin = (id: string, typeLabel: string, label: string, y: number) =>
    node({ id, kind: "origin", layer: "issue", typeLabel, label, x: originX, y, w: 200, h: 74, hypothetical: true });
  const drawnNotes = [...leftY.keys()].filter((id) => used.has(id));
  if (drawnNotes.length) {
    const firstRow = rows[0]?.noteIds.length ? rows[0].noteIds : drawnNotes.slice(0, 1);
    const y = firstRow.reduce((sum, id) => sum + leftY.get(id)!, 0) / firstRow.length;
    nodes.push(origin("origin-consultation", "相談（検索の起点）", scenario.question, y));
    for (const id of drawnNotes) {
      edges.push({
        id: `plan:origin-consultation>${id}`,
        source: "origin-consultation",
        target: id,
        kind: "plan",
        label: "検索で取得",
        route: "side",
      });
    }
  }
  rows.forEach((row, index) => {
    const previous = rows[index - 1]?.question;
    const answerId = `answer-${row.question.id}`;
    if (!row.answer || !previous || !leftY.has(answerId)) return;
    const id = `origin-${previous.id}`;
    nodes.push(origin(id, `${previous.id} · 前の質問（再掲）`, previous.text, leftY.get(answerId)!));
    edges.push({ id: `plan:${id}>${answerId}`, source: id, target: answerId, kind: "plan", label: "匠の回答" });
  });

  const noteIds = [...used];
  return {
    key: `plan:${scenario.id}:${questions.map((item) => item.id).join(",")}`,
    tone: "plan",
    nodes,
    edges,
    emphasisNodeIds: noteIds,
    emphasisEdgeIds: edges.map((item) => item.id),
    badges: Object.fromEntries(
      hits
        .filter((hit) => used.has(hit.nodeId))
        .map((hit) => [hit.nodeId, "参照"]),
    ),
    caption: "質問の根拠",
    stats: `質問${rows.length}件 · 参照した既存知見${noteIds.length}件（一時表示・保存しない）`,
    rows: rows.map(({ noteIds: _ids, answerIndex: _index, ...row }) => row),
  };
}

/**
 * Emphasis drawn over the whole approved map for one consultation step
 * (Expert Matching, Question Plan). Approved nodes stay as they are; the
 * temporary items live in a band under the map and are never saved.
 */
export type Spotlight = {
  key: string;
  tone: "expected" | "plan";
  /** Approved nodes and relations kept lit (the rest is dimmed). */
  nodeIds: string[];
  edgeIds: string[];
  /** Approved nodes marked as where knowledge can go / what the step is about. */
  targetIds: string[];
  /** Temporary items (the expected note), in the row kept for them. */
  extraNodes: OntologyNode[];
  extraEdges: OntologyEdge[];
  badges: Record<string, string>;
  /** Nodes the camera frames; empty frames the whole map. */
  frameIds: string[];
  /** Label of the band holding the temporary items. */
  band?: string;
  /**
   * Expert Matching: the candidates in the people layer. Being picked is shown
   * by the person node itself (colour, rank and portrait), not by a label.
   */
  people?: { id: string; expertId: number; rank: number; selected: boolean }[];
  /** Kept visible but light: the other candidates and their specialities. */
  softNodeIds?: string[];
  softEdgeIds?: string[];
};

/** The candidates as drawn in the people layer, in recommendation order. */
function candidatePeople(candidates: ExpertCandidate[], selected?: ExpertCandidate) {
  return candidates.flatMap((candidate, index) => {
    const id = personIdByName(candidate.expert.name);
    return id
      ? [{ id, expertId: candidate.expert.id, rank: index + 1, selected: candidate === selected }]
      : [];
  });
}

/** What every candidate is connected to: their team and their specialities. */
const candidateLinks = (view: Pick<OntologyView, "edges">, people: string[]) =>
  view.edges.filter(
    (item) => people.includes(item.source) && (item.label === "所属" || item.label === "専門"),
  );

const themeCluster = (scenario: Scenario) => clusterDefOf(scenario);
const edgeBetween = (view: Pick<OntologyView, "edges">, a: string, b: string) =>
  view.edges.find(
    (item) => (item.source === a && item.target === b) || (item.source === b && item.target === a),
  );

export type ExpertSpotlight = Spotlight & {
  personId: string;
  /** Topics the person's 専門領域 names, anywhere on the map. */
  specialties: { id: string; label: string; domain: string }[];
  /** Where an interview with the person is expected to add knowledge (this theme). */
  targets: { id: string; label: string; typeLabel: string; relation: string }[];
  /** Notes the person wrote (retrieved ones first). */
  notes: { id: string; title: string; retrieved: boolean }[];
};

/**
 * Expert Matching on the whole map: the selected person, their team and the
 * topics they are an expert in, the notes they wrote, and where an interview
 * with them could add knowledge in this consultation's theme (a temporary,
 * unregistered note in the band under the map).
 */
export function expertSpotlight({
  view,
  scenario,
  candidate,
  candidates = [candidate],
}: {
  view: Pick<OntologyView, "nodes" | "edges">;
  scenario: Scenario;
  candidate: ExpertCandidate;
  /** All candidates, drawn in the people layer with this one selected. */
  candidates?: ExpertCandidate[];
}): ExpertSpotlight {
  const cluster = themeCluster(scenario);
  const byId = new Map(view.nodes.map((item) => [item.id, item]));
  const personId = personIdByName(candidate.expert.name)!;
  const lit = new Set<string>([personId]);
  const litEdges = new Set<string>();
  const light = (edge?: OntologyEdge) => {
    if (!edge) return;
    litEdges.add(edge.id);
    lit.add(edge.source);
    lit.add(edge.target);
  };
  // Organization: team, department and the domain the team looks after.
  const team = view.edges.find((item) => item.source === personId && item.label === "所属");
  light(team);
  if (team) {
    light(view.edges.find((item) => item.target === team.target && item.label === "配下"));
    light(view.edges.find((item) => item.source === team.target && item.label === "担当"));
  }
  const specialtyEdges = view.edges.filter((item) => item.source === personId && item.label === "専門");
  specialtyEdges.forEach(light);
  const writes = view.edges.filter((item) => item.source === personId && item.label === "執筆");
  const retrieved = new Set(candidate.sources.map((source) => source.item.id));
  // Of the notes the person wrote, the ones this consultation retrieved.
  writes
    .filter((item) => retrieved.has(byId.get(item.target)?.knowledgeId ?? ""))
    .forEach(light);

  // Where the interview would add knowledge in this theme.
  const profile = `${candidate.expert.tags.join(" ")} ${candidate.expert.focus}`;
  const themeTopics = unique([
    ...cluster.topics
      .filter((topic) => topic.stems.some((stem) => profile.includes(stem)))
      .map((topic) => topicNodeId(cluster.id, topic.label)),
    ...candidate.matched
      .map((term) => conceptForTerm(cluster, term))
      .filter((id) => id.startsWith("topic-")),
  ]).filter((id) => byId.has(id));
  const targets: ExpertSpotlight["targets"] = [];
  const partId = `part-${cluster.id}`;
  if (byId.has(partId)) targets.push({ id: partId, label: byId.get(partId)!.label, typeLabel: "対象部品", relation: "対象部品（想定）" });
  for (const id of themeTopics) targets.push({ id, label: byId.get(id)!.label, typeLabel: "技術・観点", relation: "確認観点（想定）" });
  if (!themeTopics.length) {
    const domainId = `domain-${cluster.id}`;
    targets.push({ id: domainId, label: byId.get(domainId)!.label, typeLabel: "工程領域", relation: "工程領域（想定）" });
  }
  targets.forEach((target) => lit.add(target.id));

  const expectedId = `expected-${candidate.expert.id}`;
  const issue = askedIssue(cluster, scenario);
  const extraNodes = [
    node({
      id: expectedId,
      kind: "knowledge",
      layer: "registered",
      typeLabel: "想定される知見（未登録）",
      label: `${issue}の判断基準`,
      sub: `${candidate.expert.name}へのインタビュー後`,
      x: centerX(cluster),
      y: EXPECTED_Y,
      w: 250,
      h: 92,
      cluster: cluster.id,
      hypothetical: true,
      fontScale: 1.35,
      desc: "インタビュー前の想定です。登録PRをApprove・Mergeするまでグラフには入りません。",
    }),
  ];
  const extraEdges: OntologyEdge[] = [
    { id: `expected:${personId}>${expectedId}`, source: personId, target: expectedId, kind: "expected", label: "回答者（想定）" },
    ...targets.map((target) => ({
      id: `expected:${expectedId}>${target.id}`,
      source: expectedId,
      target: target.id,
      kind: "expected" as const,
      label: target.relation,
    })),
  ];
  const ownRetrieved = writes
    .map((item) => item.target)
    .filter((id) => retrieved.has(byId.get(id)?.knowledgeId ?? ""))
    .slice(0, 4);
  const specialties = specialtyEdges.map((item) => {
    const topic = byId.get(item.target)!;
    return {
      id: topic.id,
      label: topic.label,
      domain: clusterDefs.find((entry) => entry.id === topic.cluster)?.domain ?? "",
    };
  });
  return {
    key: `expert:${scenario.id}:${candidate.expert.id}`,
    tone: "expected",
    nodeIds: [...lit, expectedId],
    edgeIds: [...litEdges, ...extraEdges.map((item) => item.id)],
    targetIds: targets.map((target) => target.id),
    extraNodes,
    extraEdges,
    badges: { [expectedId]: "想定" },
    // The person, where they can add knowledge, the expected note and the
    // first notes they wrote: one column (or two) of the map, close enough to read.
    frameIds: unique([personId, ...targets.map((target) => target.id), expectedId, ...ownRetrieved.slice(0, 2)]),
    band: "インタビュー後に追加が想定される知見（一時表示・保存しない）",
    people: candidatePeople(candidates, candidate),
    ...(() => {
      const others = candidatePeople(candidates)
        .map((item) => item.id)
        .filter((id) => id !== personId);
      const links = candidateLinks(view, others);
      return {
        softNodeIds: unique([...others, ...links.map((item) => item.target)]),
        softEdgeIds: links.map((item) => item.id),
      };
    })(),
    personId,
    specialties,
    targets,
    notes: writes
      .map((item) => byId.get(item.target)!)
      .map((note) => ({ id: note.knowledgeId!, title: note.label, retrieved: retrieved.has(note.knowledgeId!) }))
      .sort((a, b) => Number(b.retrieved) - Number(a.retrieved)),
  };
}

/**
 * Expert Matching before a person is chosen: the whole map with every
 * candidate, their team and the topics they are an expert in.
 */
export function candidateOverview({
  view,
  scenario,
  candidates,
}: {
  view: Pick<OntologyView, "nodes" | "edges">;
  scenario: Scenario;
  candidates: ExpertCandidate[];
}): Spotlight {
  const people = candidatePeople(candidates);
  const edges = candidateLinks(view, people.map((item) => item.id));
  return {
    key: `experts:${scenario.id}`,
    tone: "expected",
    nodeIds: unique([...people.map((item) => item.id), ...edges.map((item) => item.target)]),
    edgeIds: edges.map((item) => item.id),
    targetIds: [],
    extraNodes: [],
    extraEdges: [],
    badges: {},
    frameIds: [],
    people,
  };
}


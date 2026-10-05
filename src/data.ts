import { additionalExperts } from "./expert-seeds.ts";
import { additionalKnowledge } from "./knowledge-seeds.ts";

export type ScenarioId = "aluminum" | "welding" | "molding";
export type Expert = {
  id: number;
  name: string;
  reading: string;
  role: string;
  years: number;
  initials: string;
  tags: string[];
  color: string;
  quote: string;
  contribution: number;
  category: string;
  focus: string;
};
export const experts: Expert[] = [
  {
    id: 1,
    name: "田中 正一",
    reading: "SHOICHI TANAKA",
    role: "精密加工 / 生産技術部",
    years: 28,
    initials: "田",
    tags: ["切削加工", "薄肉加工", "治具設計"],
    color: "sage",
    quote: "図面の数字だけでは見えない、材料の「動き」を読む。",
    contribution: 46,
    category: "切削加工",
    focus:
      "薄肉部品のクランプ、治具の支持点、荒加工と仕上げの工程分離。固定時と解放後の測定から加工変形の原因を切り分けます。",
  },
  {
    id: 2,
    name: "佐藤 美咲",
    reading: "MISAKI SATO",
    role: "材料・接合 / 製造技術部",
    years: 19,
    initials: "佐",
    tags: ["アルミ合金", "溶接変形", "熱処理"],
    color: "sand",
    quote: "熱がどこに残るかを考えると、変形の理由が見えてきます。",
    contribution: 32,
    category: "材料・接合",
    focus:
      "仮付けの配置、溶接順序、拘束解放時の温度。部材の初期状態から溶接後のひずみまでを工程ごとに確認します。",
  },
  {
    id: 3,
    name: "鈴木 健二",
    reading: "KENJI SUZUKI",
    role: "金型・成形 / 品質技術部",
    years: 24,
    initials: "鈴",
    tags: ["射出成形", "金型設計", "品質改善"],
    color: "slate",
    quote: "小さな違和感を言葉にすることが、再現できる品質につながる。",
    contribution: 38,
    category: "金型・成形",
    focus:
      "リブ裏のヒケ、局所的な肉だまり、保圧による重量と外観の変化。形状と成形条件のどちらを見直すかを検討します。",
  },
  ...additionalExperts,
];
export type Scenario = {
  id: ScenarioId;
  label: string;
  question: string;
  title: string;
  tags: string[];
  expertId: number;
  related: string[];
  gap: string;
  dialogue: { speaker: "ai" | "expert"; text: string; annotation?: string }[];
  insight: string;
  recommendations: { title: string; body: string }[];
  conditions: string;
};
export const scenarios: Scenario[] = [
  {
    id: "aluminum",
    label: "薄肉部品の加工変形",
    question:
      "A6061の薄肉ハウジング（肉厚2mm）で、切削後に反りが発生しています。寸法精度を安定させるために、設計と加工工程でどのような工夫ができますか？",
    title: "薄肉アルミハウジングの反り対策",
    tags: ["A6061", "薄肉加工", "加工変形"],
    expertId: 1,
    related: [
      "薄肉部品のクランプ方法",
      "A6061の残留応力と加工順序",
      "仕上げ工程での寸法変動",
    ],
    gap: "加工順序の記録はありますが、クランプを緩める判断基準と、形状に応じた治具の工夫が不足しています。",
    dialogue: [
      {
        speaker: "ai",
        text: "田中さん、肉厚2mmのA6061ハウジングで切削後に反りが出ています。加工条件を調整する前に、まず何を確認しますか？",
      },
      {
        speaker: "expert",
        text: "まず、治具から外した直後に反るのか、加工中から反っているのかを分けます。外した後なら、締め付けで変形した状態のまま削っている可能性があります。",
      },
      {
        speaker: "ai",
        text: "「締め付けで変形した状態」を、現場ではどう見分けますか？ 数値だけでは分からない判断の手がかりも教えてください。",
        annotation: "判断の手がかりを深掘り",
      },
      {
        speaker: "expert",
        text: "荒加工の後に一度クランプを緩め、自由な状態で基準面を測ります。締めた状態との差を見るんです。薄い壁を直接押さえず、底面の剛性がある場所で支持するのも大事です。",
      },
      {
        speaker: "ai",
        text: "荒加工後に拘束を解放して測定するのですね。設計側に戻せる工夫と、この方法をそのまま適用できない条件はありますか？",
        annotation: "適用条件と設計への還元",
      },
      {
        speaker: "expert",
        text: "許されるならコーナーにRを付け、支持できる座面を設けてもらいます。両面を偏りなく削る工程も検討します。ただ、形状や素材の履歴で変わるので、取り代や締付力は試作で決める必要があります。",
      },
    ],
    insight:
      "反りの原因は、切削条件だけでなく「拘束した状態で削ること」にある。荒加工後に拘束を解き、自由状態で測る工程が、原因の切り分けにつながる。",
    recommendations: [
      {
        title: "設計：支持できる形状をつくる",
        body: "剛性のある底面に治具の支持座面を確保。機能要件を確認しながら、コーナーRや局所的な補強を検討する。",
      },
      {
        title: "工程：荒加工と仕上げの間で解放する",
        body: "荒加工 → クランプ解放 → 自由状態の測定 → 再固定 → 仕上げの順序を試作で検証する。",
      },
      {
        title: "検証：拘束の有無で寸法を比較する",
        body: "治具固定時と解放時の測定値を記録し、素材の残留応力とクランプによる変形を切り分ける。",
      },
    ],
    conditions:
      "A6061薄肉ハウジングを想定した架空の対話です。取り代、締付力、寸法公差は実部品での検証が必要です。",
  },
  {
    id: "welding",
    label: "溶接後のひずみ",
    question:
      "ステンレス製ブラケットで、溶接後の角度ひずみが安定しません。手直しを減らすための溶接順序や治具の工夫を知りたいです。",
    title: "ステンレス製ブラケットの溶接ひずみ対策",
    tags: ["ステンレス", "溶接変形", "治具設計"],
    expertId: 2,
    related: [
      "ブラケットの溶接順序",
      "入熱管理と角度ひずみ",
      "仮付けと拘束の事例",
    ],
    gap: "入熱の管理記録はありますが、仮付けの配置と治具を外すタイミングの判断が明文化されていません。",
    dialogue: [
      {
        speaker: "ai",
        text: "佐藤さん、ブラケットの溶接後の角度ひずみが安定しません。最初にどこを確認しますか？",
      },
      {
        speaker: "expert",
        text: "同じ条件でも仮付けの位置と順番で動きが変わります。まず、溶接前の隙間と仮付けの配置をそろえて比較します。",
      },
      {
        speaker: "ai",
        text: "配置をそろえてもひずむ場合、溶接順序をどう判断しますか？",
        annotation: "経験的な判断基準を深掘り",
      },
      {
        speaker: "expert",
        text: "片側を一気に仕上げず、熱が一方向に偏らない順番を考えます。実際の形状で試験片を作り、各工程で角度の変化を測って、どこで動くかを見ます。",
      },
      {
        speaker: "ai",
        text: "治具で強く拘束すれば解決するのでしょうか？ 設計側へ戻すべき条件も教えてください。",
        annotation: "例外と適用限界を確認",
      },
      {
        speaker: "expert",
        text: "拘束を強めるだけでは、外した時に動くことがあります。治具を外す時の温度条件をそろえ、必要な溶接量や接合位置も設計側と見直します。溶接条件は認定された手順の範囲で検証します。",
      },
    ],
    insight:
      "溶接ひずみのばらつきは、仮付け・入熱の順序・拘束解放時の条件を一組として管理することで原因を追いやすくなる。",
    recommendations: [
      {
        title: "設計：接合位置と必要な溶接量を確認する",
        body: "強度要件を満たす範囲で溶接量と接合位置を検討し、入熱が偏る形状を見直す。",
      },
      {
        title: "工程：仮付けと溶接順序を標準化する",
        body: "部材間の隙間と仮付け位置を記録し、熱が偏らない順序を試験片で比較する。",
      },
      {
        title: "検証：治具解放の条件をそろえる",
        body: "工程ごとの角度と解放時の温度を記録し、同じ条件で変形量を比較する。",
      },
    ],
    conditions:
      "架空の溶接事例です。材質・板厚・強度要件に応じて、承認済みの溶接施工要領と試験で妥当性を確認してください。",
  },
  {
    id: "molding",
    label: "樹脂成形の品質ばらつき",
    question:
      "樹脂カバーの射出成形で、リブの裏側にヒケが発生します。外観品質を安定させるために、設計と成形条件の両面から改善したいです。",
    title: "樹脂カバーのリブ裏のヒケ対策",
    tags: ["射出成形", "金型設計", "ヒケ"],
    expertId: 3,
    related: [
      "リブ形状と肉厚の設計指針",
      "保圧条件とゲートの関係",
      "成形品の外観評価手順",
    ],
    gap: "成形条件の記録だけでは、形状起因と条件起因をどう見分けたかが読み取れません。",
    dialogue: [
      {
        speaker: "ai",
        text: "鈴木さん、樹脂カバーのリブ裏のヒケについて、最初に何を確認しますか？",
      },
      {
        speaker: "expert",
        text: "ヒケの位置がいつも同じかを見ます。リブの根元に集中していれば、局所的に肉が厚く、冷え方が違う可能性を考えます。",
      },
      {
        speaker: "ai",
        text: "形状起因か成形条件起因かは、どのように切り分けますか？",
        annotation: "原因を切り分ける思考を深掘り",
      },
      {
        speaker: "expert",
        text: "材料の状態や金型温度をそろえてから、保圧を段階的に変え、重量と外観を一緒に記録します。条件を変えても同じ場所に残るなら、形状やゲートからの圧力の伝わり方を疑います。",
      },
      {
        speaker: "ai",
        text: "設計へどのようにフィードバックしますか？ やみくもにリブを薄くするリスクも教えてください。",
        annotation: "設計のトレードオフを確認",
      },
      {
        speaker: "expert",
        text: "リブ根元の肉厚や交差部の肉だまりを見直します。ただし薄くしすぎると充填や強度に影響します。材料メーカーの指針を参照し、流動解析と試作で外観・強度の両方を確認します。",
      },
    ],
    insight:
      "ヒケの位置と、保圧を変えた際の重量・外観の変化を一緒に記録することで、形状と成形条件のどちらを見直すべきか判断しやすくなる。",
    recommendations: [
      {
        title: "設計：リブ根元の肉だまりを減らす",
        body: "リブの交差部や根元の肉厚を見直し、強度と充填性を確保できる形状を検討する。",
      },
      {
        title: "工程：変数を一つずつ比較する",
        body: "材料の状態と金型温度をそろえ、保圧条件を段階的に変更して重量と外観を記録する。",
      },
      {
        title: "検証：外観と強度を同時に評価する",
        body: "材料指針と流動解析を参照し、試作でヒケ・充填性・強度を確認する。",
      },
    ],
    conditions:
      "架空の射出成形事例です。樹脂グレードや金型仕様で適切な条件が異なるため、材料指針と試作で検証してください。",
  },
];
export function matchScenario(q: string): Scenario {
  return /溶接|ひずみ|ステンレス|接合/.test(q)
    ? scenarios[1]
    : /樹脂|成形|ヒケ|金型/.test(q)
      ? scenarios[2]
      : scenarios[0];
}
export type Knowledge = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  author: string;
  date: string;
  isNew?: boolean;
  recommendations?: Scenario["recommendations"];
  conditions?: string;
  provenance?: {
    question: string;
    sourceIds: string[];
    dialogue: Scenario["dialogue"];
    review: {
      reviewer: string;
      comment: string;
      mergedAt: string;
      simulated: boolean;
    };
  };
};
export const initialKnowledge: Knowledge[] = [
  {
    id: "k1",
    title: "薄肉部品を変形させない、治具の支持点の考え方",
    summary:
      "壁面を直接押さえず、剛性のある底面を支持する。固定時と自由状態の差を測定して、拘束による変形を切り分ける。",
    tags: ["工程設計", "切削加工", "治具設計"],
    author: "田中 正一",
    date: "2026.10.02",
    recommendations: scenarios[0].recommendations,
    conditions: scenarios[0].conditions,
  },
  {
    id: "k2",
    title: "溶接ひずみを抑える、仮付けと施工順序",
    summary:
      "仮付け位置と隙間をそろえ、入熱が一方向に偏らない順序を検討。解放時の条件も記録する。",
    tags: ["溶接変形", "工程設計"],
    author: "佐藤 美咲",
    date: "2026.09.30",
    recommendations: scenarios[1].recommendations,
    conditions: scenarios[1].conditions,
  },
  {
    id: "k3",
    title: "リブ裏のヒケから読み解く、設計と成形の接点",
    summary:
      "ヒケの位置と、保圧変更時の重量・外観の変化を比較。形状と成形条件の影響を切り分ける。",
    tags: ["射出成形", "品質改善"],
    author: "鈴木 健二",
    date: "2026.09.28",
    recommendations: scenarios[2].recommendations,
    conditions: scenarios[2].conditions,
  },
  ...additionalKnowledge,
];

/** Refresh built-in examples while retaining locally saved interview notes. */
export function mergeKnowledge(saved: Knowledge[]): Knowledge[] {
  const seedIds = new Set(initialKnowledge.map((item) => item.id));
  const uniqueSaved = new Map(
    saved
      .filter((item) => !seedIds.has(item.id))
      .map((item) => [item.id, item]),
  );
  return [...uniqueSaved.values(), ...initialKnowledge];
}

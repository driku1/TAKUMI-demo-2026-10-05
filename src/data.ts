import { additionalExperts } from "./expert-seeds.ts";
import { additionalKnowledge } from "./knowledge-seeds.ts";

export type BaseScenarioId = "aluminum" | "welding" | "molding";
/** Second-cycle consultation that reuses the knowledge registered in the first cycle. */
export type FollowUpScenarioId = `${BaseScenarioId}-c2`;
export type ScenarioId = BaseScenarioId | FollowUpScenarioId;
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
  /** Present only on second-cycle consultations. */
  followUp?: FollowUpPlan;
};
/**
 * How a second-cycle answer may reuse the registered first-cycle knowledge.
 * Passages are searched in the saved knowledge itself; a rule without a match
 * is answered from the new interview only.
 */
export type ReuseRule = {
  id: string;
  label: string;
  /** Topic node label in the ontology graph (確認観点). */
  topic?: string;
  /** Keywords searched in the saved knowledge (recommendations → dialogue → conditions). */
  find: string[];
  /** Prepared demo text: how the passage is applied to this consultation. */
  appliedAs: string;
  /** Index of the supporting expert answer in this scenario's dialogue. */
  answerIndex?: number;
};
export type FollowUpPlan = {
  baseScenarioId: BaseScenarioId;
  /** Issue node label in the ontology graph that this consultation addresses. */
  issue: string;
  /** Q1 used when first-cycle knowledge was retrieved. {title} / {id} are replaced. */
  questionWithKnowledge: string;
  annotationWithKnowledge: string;
  /** Gap sentence appended after the generated "registered knowledge covers …" prefix. */
  remainingGap: string;
  reuse: ReuseRule[];
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
export const followUpScenarios: Scenario[] = [
  {
    id: "aluminum-c2",
    label: "派生品の壁形状変更",
    question:
      "薄肉アルミハウジングの派生品で、壁の形状が変わります。治具と加工工程で、事前に確認すべき点は？",
    title: "派生品の薄肉ハウジングで、支持と拘束解放の手順を流用する",
    tags: ["薄肉加工", "治具設計", "加工変形", "派生設計"],
    expertId: 1,
    related: [
      "派生形状での治具の支持点",
      "荒加工後の拘束解放と測定",
      "元の形状の記録との比較",
    ],
    gap: "壁の形状が変わる派生品について、治具の支持点と拘束解放の手順をどこまで流用できるかの判断基準が見つかりません。",
    dialogue: [
      {
        speaker: "ai",
        text: "壁の形状が変わる派生品で、切削後の反りを防ぐために、最初に何を確認しますか？",
      },
      {
        speaker: "expert",
        text: "荒加工の後に拘束を解放し、自由状態で測る手順を入れます。壁の形が変わると支持できる面の位置も変わるので、治具の支持点は形状ごとに確認し直します。",
        annotation: "デモ用の専門家回答",
      },
      {
        speaker: "ai",
        text: "支持点を見直すとき、元の形状の記録はどう使いますか？",
        annotation: "比較の方法を深掘り",
      },
      {
        speaker: "expert",
        text: "元の形状と同じ項目で、固定時と解放時の差を測ります。差の出方が変われば、支持点と工程順序のどちらを見直すかを切り分けやすくなります。",
        annotation: "デモ用の専門家回答",
      },
      {
        speaker: "ai",
        text: "設計側へ戻すべき点と、この流用が当てはまらない条件はありますか？",
        annotation: "適用条件と設計への還元",
      },
      {
        speaker: "expert",
        text: "支持できる座面を設計段階で確保してもらう点は変わりません。壁の形状や素材の履歴が大きく違う場合は、取り代や締付力を試作で決め直す必要があります。",
        annotation: "デモ用の専門家回答",
      },
    ],
    insight:
      "派生品でも、荒加工後に拘束を解放して測る手順は流用できる。壁の形状変更に合わせて支持点を確認し直し、元の形状と同じ項目で固定時・解放時の差を比較する。",
    recommendations: [
      {
        title: "設計：派生形状でも支持座面を確保する",
        body: "壁の形状変更で支持できる面が変わらないかを確認し、剛性のある座面を設計段階で確保する。",
      },
      {
        title: "工程：解放・測定の手順を流用する",
        body: "荒加工後の解放と自由状態の測定を派生品の工程にも入れ、元の形状と同じ項目で記録する。",
      },
      {
        title: "検証：元の形状の記録と比較する",
        body: "固定時と解放時の差を元の形状の記録と比較し、支持点と工程順序のどちらを見直すかを切り分ける。",
      },
    ],
    conditions:
      "架空の対話です。壁の形状や素材の履歴が異なる場合、取り代・締付力・寸法公差は派生品の試作で確認してください。",
    followUp: {
      baseScenarioId: "aluminum",
      issue: "加工変形",
      questionWithKnowledge:
        "登録済みの知見「{title}」（{id}）を前提に確認します。壁の形状が変わる派生品でも、この知見の手順で足りない点はありますか？",
      annotationWithKnowledge: "登録知見を前提に差分だけ確認",
      remainingGap:
        "壁の形状が変わる派生品で、どこまで流用でき、どこを確認し直すかの判断基準は未登録です。",
      reuse: [
        {
          id: "support",
          label: "治具の支持点",
          topic: "治具設計",
          find: ["支持"],
          appliedAs:
            "壁の形状変更で支持できる面が変わらないかを、登録知見の支持の考え方で確認する。",
          answerIndex: 1,
        },
        {
          id: "release",
          label: "荒加工後の拘束解放",
          topic: "薄肉加工",
          find: ["解放"],
          appliedAs:
            "荒加工後に拘束を解放して自由状態で測る手順を、派生品の工程にも入れる。",
          answerIndex: 1,
        },
        {
          id: "compare",
          label: "固定時と解放時の比較",
          topic: "残留応力",
          find: ["比較", "切り分け"],
          appliedAs:
            "元の形状と同じ項目で固定時・解放時の差を測り、支持点と工程順序のどちらを見直すかを切り分ける。",
          answerIndex: 3,
        },
      ],
    },
  },
  {
    id: "welding-c2",
    label: "派生品の溶接箇所追加",
    question:
      "ステンレス製ブラケットの派生品で、溶接箇所が増えます。ひずみを抑えるために、事前に確認すべき点は？",
    title: "溶接箇所が増える派生品で、仮付け・順序・解放条件をそろえて比較する",
    tags: ["溶接変形", "仮付け", "治具設計", "派生設計"],
    expertId: 2,
    related: [
      "増えた溶接箇所と入熱の偏り",
      "溶接順序案の比較",
      "治具解放条件の統一",
    ],
    gap: "溶接箇所が増える派生品について、仮付け・溶接順序・治具解放の条件をどう組み直すかの判断基準が見つかりません。",
    dialogue: [
      {
        speaker: "ai",
        text: "溶接箇所が増える派生品で、ひずみを抑えるために最初に何を確認しますか？",
      },
      {
        speaker: "expert",
        text: "増えた溶接箇所を含めて、熱がどちらに偏るかを先に確認します。仮付けの配置と隙間は、元の製品と同じ項目で記録します。",
        annotation: "デモ用の専門家回答",
      },
      {
        speaker: "ai",
        text: "溶接順序は、元の製品の順序をそのまま使えますか？",
        annotation: "流用できる範囲を深掘り",
      },
      {
        speaker: "expert",
        text: "そのままでは使えないことがあります。増えた箇所を入れた順序案をいくつか作り、試験片で各工程の角度の変化を比べます。",
        annotation: "デモ用の専門家回答",
      },
      {
        speaker: "ai",
        text: "治具の解放と、設計へのフィードバックはどうしますか？",
        annotation: "解放条件と設計への還元",
      },
      {
        speaker: "expert",
        text: "解放時の温度条件は元の製品とそろえます。溶接量や接合位置は設計側と見直し、溶接条件は認定された手順の範囲で検証します。",
        annotation: "デモ用の専門家回答",
      },
    ],
    insight:
      "溶接箇所が増える派生品では、仮付け・入熱の順序・拘束解放の条件を一組で管理する考え方を流用し、増えた箇所を含めた熱の偏りと順序案を試験片で比較する。",
    recommendations: [
      {
        title: "設計：増えた溶接箇所の熱の偏りを確認する",
        body: "増えた溶接箇所を含めて熱が偏る形状になっていないかを、設計側と確認する。",
      },
      {
        title: "工程：順序案を試験片で比較する",
        body: "増えた箇所を入れた溶接順序の案を作り、各工程の角度の変化を試験片で比べる。",
      },
      {
        title: "検証：解放条件を元の製品とそろえる",
        body: "治具を外す時の温度条件と記録項目を元の製品とそろえ、変形量を比較する。",
      },
    ],
    conditions:
      "架空の溶接事例です。材質・板厚・強度要件に応じて、承認済みの溶接施工要領と試験で妥当性を確認してください。",
    followUp: {
      baseScenarioId: "welding",
      issue: "溶接ひずみ",
      questionWithKnowledge:
        "登録済みの知見「{title}」（{id}）を前提に確認します。溶接箇所が増える派生品では、この知見のどこから確認しますか？",
      annotationWithKnowledge: "登録知見を前提に差分だけ確認",
      remainingGap:
        "溶接箇所が増えた場合に、順序と解放条件をどう組み直すかの判断基準は未登録です。",
      reuse: [
        {
          id: "tack",
          label: "仮付けの配置と隙間",
          topic: "仮付け",
          find: ["仮付け"],
          appliedAs:
            "仮付けの配置と隙間を、元の製品と同じ項目で記録して比較する。",
          answerIndex: 1,
        },
        {
          id: "order",
          label: "溶接順序",
          topic: "温度管理",
          find: ["順序"],
          appliedAs:
            "熱が偏らない順序の考え方を出発点に、増えた箇所を入れた順序案を試験片で比べる。",
          answerIndex: 3,
        },
        {
          id: "release",
          label: "治具解放の条件",
          topic: "接合",
          find: ["解放"],
          appliedAs: "治具を外す時の温度条件を元の製品とそろえて記録する。",
          answerIndex: 5,
        },
      ],
    },
  },
  {
    id: "molding-c2",
    label: "形状の量産時の注意点",
    question: "この形状を量産する際の注意点は？",
    title:
      "量産時の反りを、リブ周辺・ゲート位置・冷却回路のバランスから確認する",
    tags: ["反り", "リブ周辺", "ゲート位置", "冷却回路", "量産設計"],
    expertId: 3,
    related: [
      "リブ周辺の収縮差と反り",
      "ゲート位置による充填状態の違い",
      "冷却回路のバランスと変形方向",
    ],
    gap: "量産時の反りについて、リブ周辺・ゲート位置・冷却回路のバランスを同じ記録で比較する判断手順が見つかりません。",
    dialogue: [
      {
        speaker: "ai",
        text: "この形状を量産する際の注意点は？",
        annotation: "スライドの問いを起点に確認",
      },
      {
        speaker: "expert",
        text: "冷却時の収縮差による反りに注意します。特にリブ周辺で変形が集中していないか、位置と方向を確認します。",
        annotation: "デモ用の専門家回答",
      },
      {
        speaker: "ai",
        text: "反りを抑えるために、ゲート位置はどのように確認しますか？",
        annotation: "ゲート位置の影響を深掘り",
      },
      {
        speaker: "expert",
        text: "ゲート位置ごとの充填状態と反りの出方を比較し、変形の位置と方向を設計条件へ対応づけます。",
        annotation: "デモ用の専門家回答",
      },
      {
        speaker: "ai",
        text: "冷却回路のバランスは、設計と共有知識へどう反映しますか？",
        annotation: "冷却と知識共有を深掘り",
      },
      {
        speaker: "expert",
        text: "冷却回路ごとの状態と反りの位置・方向を対応づけて記録し、ゲート位置の検討結果と合わせて設計へ共有します。",
        annotation: "デモ用の専門家回答",
      },
    ],
    insight:
      "量産時は冷却時の収縮差による反りに注意し、リブ周辺の変形を起点に、ゲート位置と冷却回路のバランスを分けて確認する。結果は設計条件と共有知識へ戻す。",
    recommendations: [
      {
        title: "形状：リブ周辺の反りを確認する",
        body: "反りが集中する位置と方向を確認し、リブ周辺の形状との対応を記録する。",
      },
      {
        title: "金型：ゲート位置の影響を比較する",
        body: "ゲート位置ごとの充填状態と反りの出方を比較し、設計へ共有する。",
      },
      {
        title: "冷却：回路のバランスを確認する",
        body: "冷却回路ごとの状態と変形の位置・方向を対応づけ、収縮差の影響を確認する。",
      },
    ],
    conditions:
      "スライドの流れを再現するデモ用の専門家回答です。原資料にない材質・数値条件は断定せず、対象形状と実際の製造条件に基づいて専門家が確認してください。",
    followUp: {
      baseScenarioId: "molding",
      issue: "量産時の反り",
      questionWithKnowledge:
        "この形状を量産する際の注意点は？ 登録済みの知見「{title}」（{id}）にあるリブ周辺の確認を前提に、量産で追加して見るべき点を教えてください。",
      annotationWithKnowledge: "登録知見を前提に差分だけ確認",
      remainingGap:
        "量産時の反りについて、冷却回路のバランスまで含めて同じ記録で比較する判断手順は未登録です。",
      reuse: [
        {
          id: "rib",
          label: "リブ周辺の肉厚",
          topic: "リブ周辺",
          find: ["リブ", "肉厚", "肉だまり"],
          appliedAs:
            "リブ根元・交差部の肉厚の偏りを先に確認し、反りが集中する位置と照合する。",
          answerIndex: 1,
        },
        {
          id: "gate",
          label: "ゲート位置",
          topic: "ゲート位置",
          find: ["ゲート"],
          appliedAs:
            "ゲート位置ごとの比較で、ゲートからの圧力の伝わり方と反りの出方を合わせて記録する。",
          answerIndex: 3,
        },
        {
          id: "cooling",
          label: "冷却回路のバランス",
          topic: "冷却回路",
          find: ["冷却回路"],
          appliedAs:
            "冷却回路ごとの状態と反りの位置・方向を対応づけて記録し、設計へ共有する。",
          answerIndex: 5,
        },
        {
          id: "method",
          label: "条件をそろえた比較",
          find: ["一つずつ", "段階的"],
          appliedAs:
            "ゲート位置や冷却回路を比べるときも、他の条件をそろえて一つずつ変え、結果を記録する。",
        },
      ],
    },
  },
];
export const allScenarios: Scenario[] = [...scenarios, ...followUpScenarios];
export function baseScenarioOf(scenario: Scenario): Scenario {
  const baseId = scenario.followUp?.baseScenarioId ?? scenario.id;
  return scenarios.find((item) => item.id === baseId) ?? scenarios[0];
}
export function followUpOf(scenario: Scenario): Scenario | undefined {
  const base = baseScenarioOf(scenario);
  return followUpScenarios.find(
    (item) => item.followUp?.baseScenarioId === base.id,
  );
}
function matchBaseScenario(q: string): Scenario {
  return /溶接|ひずみ|ステンレス|接合/.test(q)
    ? scenarios[1]
    : /樹脂|成形|ヒケ|金型/.test(q)
      ? scenarios[2]
      : scenarios[0];
}
export function matchScenario(q: string): Scenario {
  if (/量産|収縮差|冷却回路|ゲート位置/.test(q)) return followUpScenarios[2];
  if (/派生/.test(q)) return followUpOf(matchBaseScenario(q))!;
  return matchBaseScenario(q);
}
export type Knowledge = {
  id: string;
  /** Scenario the knowledge was registered from. Absent on data saved by older versions. */
  scenarioId?: ScenarioId;
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
    /** First-cycle knowledge this note was built on (second cycle only). */
    basedOn?: { id: string; title: string }[];
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

# TAKUMI — Codexスキルで進めるデモ

Codexデスクトップアプリ（Windows）の左側チャットで、スキル名と補足文を順番に入力すると、右側のブラウザに表示したTAKUMIの画面が次の工程へ自動で進むデモです。Automotive Summitデモ（BUG-2041）と同じ仕組みです。

- **Codexチャット**：スキルを呼び出し、結果を日本語で報告する
- **右側の画面**：検索 → 匠の選定 → 質問計画 → インタビュー → 回答 → 登録PR を表示する（画面のボタンでは進めない）
- **人の操作**：登録PRの「Approve review」と「Merge knowledge PR」だけは、発表者が画面で押す（スキルではマージしない）
- **自動の判定**：同じ相談や、登録した知見で答えられる相談は、匠の選定・インタビュー・登録PRを行わず、登録知見だけから自動で回答する

## 1. スキル（6つ）

| # | 入力するスキル | Codexでの表示名 | 右側の画面 | 出力（`workspace/TKM-xxx/`） |
| --- | --- | --- | --- | --- |
| 1 | `$takumi-launch` | デモ: ワークスペース起動 | Knowledge Graph（①登録前／②追加後） | なし（件数を報告） |
| 2 | `$design-consultation` | デモ: 設計相談の受付・検索 | Knowledge Search（取得した知見・Retrieval graph・Knowledge gap）。登録知見で答えられる場合は、そのまま回答まで表示 | `01-knowledge-search.md`（登録知見で回答した場合は `02-design-response.md` も） |
| 3 | `$expert-matching` | デモ: 匠の選定 | Expert Matching（左：ナレッジグラフ全体、右：候補5名。名前を選ぶと、知見を追加できるところを強調） | `02-expert-matching.md` |
| 4 | `$interview-plan` | デモ: 質問計画 | Question Plan（参照した既存知見 → 確認したい点 → 質問 の小さなグラフと質問カード） | `03-question-plan.md` |
| 5 | `$expert-interview` | デモ: 匠インタビュー | Interview（対話を再生）→ Design Response | `04-interview.md`、`05-design-response.md` |
| 6 | `$knowledge-pr` | デモ: 知見の登録PR | Knowledge PR（差分・出典・適用条件・レビュー） | `06-knowledge-pr.md` |

登録知見だけで回答した相談では、3〜6を実行しても「不要」と返します。順番を飛ばした場合は、先に実行するスキルを返します。

## 2. 準備（初回だけ）

必要環境：Windows、Node.js 22.12以降、Codexデスクトップアプリ。npm install は不要です（ビルド済みの画面と、Node.js標準機能だけで動きます）。

PowerShellで、展開した `TAKUMI-demo-2026-10-05` フォルダーに移動して実行します。

```powershell
cd "C:\…\TAKUMI-demo-2026-10-05"
node scripts/install-codex-skills.mjs
```

`%USERPROFILE%\.codex\skills` に6つのスキルが入ります（環境変数 `CODEX_HOME` がある場合はその下）。スキルにはこのフォルダーの場所が書き込まれるため、**フォルダーを移動したら再実行**してください。Codexのスキル一覧に「デモ: …」が出ない場合は、Codexを再起動してください。

## 3. 録画前

```powershell
node scripts/reset-demo.mjs        # または npm run demo:reset
```

相談・登録知見・`workspace/` の出力を消して、最初の状態に戻します。デモサーバーは最初のスキルが自動で起動します（先に起動しておく場合は `node start-demo.mjs --skills` または `npm run demo:start`。このウィンドウはデモ中は閉じません）。

## 4. デモ台本

左側のCodexチャットへ、次の「スキル名＋補足文」を1つずつ入力します。Codexの報告と右側の画面を確認してから、次へ進みます。

### Step 1：ワークスペース起動

```text
$takumi-launch ものづくり事業部のナレッジワークスペースを開いてください。
```

- 右側にTAKUMIを開き、Knowledge Graph「① 登録前」を表示
- ナレッジ40件・匠24名・登録知見0件を報告

### Step 2：設計相談の受付・検索

```text
$design-consultation 樹脂カバーの射出成形で、リブの裏側にヒケが発生します。外観品質を安定させるために、設計と成形条件の両面から改善したいです。
```

- 相談 `TKM-001` を受け付け、ナレッジを実際に検索
- 画面：Knowledge Search（取得した知見、Retrieval graph、Knowledge gap）
- 「この相談に答えられる登録知見はまだない」ため、匠の選定へ進む

### Step 3：匠の選定

```text
$expert-matching 不足している判断基準を聞ける匠を選んでください。候補者ごとに、インタビューすると得られるナレッジグラフも見せてください。
```

- 左にナレッジグラフ全体（組織 → 匠 → ナレッジの3層。候補5名は匠の層の紫の人ノード。似顔絵は右のパネルだけで、グラフには入れない）、右に候補者パネル。対話担当は鈴木 健二
- **発表者が右のパネルで名前を選ぶ**と、その人のノードが塗りつぶされ、所属・専門と、インタビューで知見を追加できるところ（想定・未登録）が強調され、グラフがその人の列へ移動する。名前を順に選ぶと候補者ごとの違いを見せられる（もう一度選ぶと全体に戻る）

### Step 4：質問計画

```text
$interview-plan 既存の知見で足りない点を整理して、匠への質問を作ってください。
```

- 参照した既存知見だけが表示され、そこから「確認したい点」、続いて「質問Q1」が現れる（約1秒）。何を取得したかはStep 2のKnowledge Searchで見せたため、ここでは繰り返さない
- 確認したい点と質問は一時表示（新しい知見として登録しない）。Q2以降は、インタビュー中に匠の回答を受けて作る

### Step 5：匠インタビュー

```text
$expert-interview 鈴木さんにインタビューして、設計への回答をまとめてください。
```

- 右側で対話を再生（約10秒）し、Design Responseを表示
- 専門家の回答はデモ用に準備した内容（Codexの報告にも明記）

### Step 6：知見の登録PR → 人が承認

```text
$knowledge-pr 今回の知見を登録PRにしてください。
```

- 右側にKnowledge PRを表示。**スキルではマージしない**
- 発表者が画面で「出典・適用条件・重複候補を確認した」にチェック →「Approve review」→「Merge knowledge PR」
- Merge後、追加された知見と接続先の補助グラフが出る

### Step 7：関連する相談（登録知見だけで自動回答）

```text
$design-consultation この形状を量産する際の注意点は？
```

- Step 6でMergeした知見と既存ナレッジ seed-2-7 で答えられるため、自動で「Knowledge retrieved → Registered knowledge found → Expert interview skipped → Response compiled」だけで回答
- Codexは「登録知見だけで回答したため、匠の選定・インタビュー・登録PRは不要」と報告
- Design Responseの「登録知見の活用」とナレッジグラフ（④の重ね表示）で、使った知見を示す

同じ相談（Step 2と同じ文）をもう一度入力した場合も、Mergeした知見から同じように回答します。Step 6のMerge前にStep 7を入力すると、登録知見がないため、通常どおり匠の選定へ進みます（対比を見せたい場合に使えます）。

## 5. 仕組み

- スキルは `node scripts/run-skill.mjs <スキル名> [--question "相談文"]` を実行します。検索・匠の照合・質問計画・オントロジーは、画面と同じ関数（`src/`）を使います。
- 実行結果は `runtime/state.json`（現在の相談と工程）に書かれ、画面は1秒ごとにそれを読んで次の工程へ進みます。
- 画面でMergeした知見は `runtime/knowledge.json` に保存され、次の相談の検索で使われます（スキル連携のときはブラウザのlocalStorageを使いません）。
- 各スキルの出力は `workspace/<相談ID>/` に保存します。
- `node start-demo.mjs`（`--skills` なし）で起動した場合は、これまでどおりのブラウザだけのデモになります。

| ファイル | 役割 |
| --- | --- |
| `skills/<スキル名>/SKILL.md`・`agents/openai.yaml` | スキルの定義（`install-codex-skills.mjs` がCodex用に、このフォルダーの場所を書き込んでコピー） |
| `scripts/run-skill.mjs` | Codexが実行するコマンド。デモサーバーが止まっていれば起動 |
| `scripts/skill-core.ts` | 6つのスキルの処理 |
| `scripts/runtime-store.mjs` | 状態・登録知見の読み書き（サーバーとスキルで共通） |
| `scripts/reset-demo.mjs` | 初期化 |
| `start-demo.mjs --skills` | 画面とAPI（`/api/state`、`/api/knowledge`）の配信 |

## 6. 困ったとき

| 症状 | 対処 |
| --- | --- |
| Codexのスキル一覧に「デモ: …」が出ない | `node scripts/install-codex-skills.mjs` を実行し、Codexを再起動 |
| 右側の画面が進まない | 画面のURLが、スキル結果の `url` と同じか確認（ポートが使用中だと4174などに変わります）。ページを再読み込みすると現在の工程を表示します |
| 「デモサーバーを起動できませんでした」 | アプリのフォルダーで `node start-demo.mjs --skills` を実行し、そのままにしてからスキルを再実行 |
| 前回のデモの続きになっている | `node scripts/reset-demo.mjs` |
| 画面のボタンで進めてしまった | `node scripts/reset-demo.mjs` で初期化し、Step 1からやり直す |
| 匠の選定で、グラフの下にパネルが出る（左右に並ばない） | 右側ブラウザの幅が狭い（約1,210px未満）ためです。ブラウザの表示倍率を下げる（Ctrl + −）か、右側ブラウザを広げてください |

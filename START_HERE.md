# TAKUMI demo — はじめに

Accenture向けの製造ナレッジ活用デモです。40件のナレッジと24名の架空Expertsを収録しています。

## デモを開く（パッケージのインストール不要）

必要環境：Node.js 22.12以降。Windows / macOS / Linuxで利用できます。

1. ZIPをすべて展開します。
2. 展開した `TAKUMI-demo` フォルダーをターミナルで開きます。
3. 次のコマンドを実行します。

   ```sh
   node start-demo.mjs
   ```

4. ブラウザで **http://127.0.0.1:4173** を開きます。
5. 終了するにはターミナルで `Ctrl+C` を押します。

ポートが使用中の場合は `node start-demo.mjs 4174` で起動し、http://127.0.0.1:4174 を開いてください。
`dist/index.html` を直接ダブルクリックせず、上記の方法で開いてください。ビルド済みファイルを同梱しているので、デモ閲覧時の `npm install` は不要です。

## 操作例

1. **Consultations** でサンプル質問を選択し、**Run agent** を押します。
2. **Activity** から検索結果、推薦Experts、質問生成、対話、設計への回答を確認します。一覧内はスクロールできます。
3. **Knowledge PR** で差分を確認・編集します。
4. 確認チェック → **Approve review** → **Merge knowledge PR** で、ブラウザ内のライブラリに登録できます。
5. **Experts** と **Knowledge Library** では専門領域による絞り込みと検索ができます。

## 同梱内容

- `dist/`：ビルド済みデモ
- `start-demo.mjs`：Node.js標準機能だけで動くローカルサーバー
- `src/`・`public/`・設定ファイル：編集用ソース
- `package.json`・`package-lock.json`：開発用依存関係
- `README.md`：仕様、制約、開発方法

## ソースコードを編集する場合

```sh
npm ci
npm run dev
```

開発用URLはターミナルの表示に従ってください。編集後、`npm run build` で同梱デモ用の `dist/` を更新できます。

## デモの範囲

- 検索は語句照合、AgentとExpertsの対話およびレビューはシミュレーションです。AI APIキーは不要です。
- PRはローカルの模擬画面で、外部サービスへの依頼・GitHubへの送信はありません。
- 保存したナレッジは閲覧者のブラウザに保存されます。送信者のブラウザに保存済みの知見はZIPに含まれません。
- Webフォントはインターネット接続時に取得します。オフラインでは端末のフォントで表示されます。

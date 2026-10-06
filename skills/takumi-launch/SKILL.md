---
name: takumi-launch
description: TAKUMIデモのナレッジワークスペースを開き、ナレッジ件数・匠の人数・Knowledge Graphを右側UIに表示する。デモ開始時に使う。
---

# デモ: ワークスペース起動

TAKUMIのナレッジワークスペースを開き、ナレッジ件数・匠の人数と、Knowledge Graph（製造ナレッジのオントロジー）を右側UIに表示する。

ユーザーの補足文章から対象や説明観点を把握したうえで、次のコマンドを実行する。

```powershell
node scripts/run-skill.mjs takumi-launch
```

デモサーバーが止まっている場合は、このコマンドが自動で起動する。起動できなかった場合だけ、アプリのフォルダで npm run demo:start を実行してから再実行する。

コマンド成功後は browser:control-in-app-browser を使い、Codexの右側ブラウザを表示する。結果JSONの url（通常は http://127.0.0.1:4173/ ）のタブがあれば再利用し、なければ新しいタブで開く。ブラウザのvisibilityを有効にし、タブをdeliverableとして残す。takumi-launchではページを読み込み直して最新の状態を表示する。

実行結果のJSONの message・screen・next から、処理内容、右側UIで確認する箇所、次に入力するスキルを日本語で簡潔に報告する。artifacts に出力したファイルがあればファイル名を添える。status が skipped の場合は理由を、error の場合は message にある対処を伝える。

右側UIは表示用であり、画面のボタンを操作して工程を進めない。特に「Approve review」と「Merge knowledge PR」は人が画面で行う操作なので、絶対にクリックしない。
専門家の回答はデモ用に準備した内容で、AIの生成結果ではない。報告で回答の内容に触れるときはそのことを明記する。

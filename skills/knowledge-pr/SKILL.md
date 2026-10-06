---
name: knowledge-pr
description: TAKUMIデモで、インタビューで得た知見の登録PR（ドラフト）を作成し、右側UIのKnowledge PR画面を開く。マージはしない。Approve reviewとMergeは人が画面で行う。
---

# デモ: 知見の登録PR

インタビューで得た知見の登録PR（ドラフト）を作成し、右側UIのKnowledge PR画面を開く。登録には人の承認が必要なため、このスキルではマージしない。

ユーザーの補足文章から対象や説明観点を把握したうえで、次のコマンドを実行する。

```powershell
node scripts/run-skill.mjs knowledge-pr
```

デモサーバーが止まっている場合は、このコマンドが自動で起動する。起動できなかった場合だけ、アプリのフォルダで npm run demo:start を実行してから再実行する。

コマンド成功後は browser:control-in-app-browser を使い、Codexの右側ブラウザを表示する。結果JSONの url（通常は http://127.0.0.1:4173/ ）のタブがあれば再利用し、なければ新しいタブで開く。ブラウザのvisibilityを有効にし、タブをdeliverableとして残す。ページは再読み込みせず、右側の画面が自動で次の工程へ進むのを待って確認する。

実行結果のJSONの message・screen・next から、処理内容、右側UIで確認する箇所、次に入力するスキルを日本語で簡潔に報告する。artifacts に出力したファイルがあればファイル名を添える。status が skipped の場合は理由を、error の場合は message にある対処を伝える。

報告の最後に、発表者が画面で確認チェック → 「Approve review」→「Merge knowledge PR」を押すと知見がナレッジグラフに追加されること、その後の同じ相談・関連する相談は $design-consultation で登録知見だけから回答されることを伝える。

右側UIは表示用であり、画面のボタンを操作して工程を進めない。特に「Approve review」と「Merge knowledge PR」は人が画面で行う操作なので、絶対にクリックしない。
専門家の回答はデモ用に準備した内容で、AIの生成結果ではない。報告で回答の内容に触れるときはそのことを明記する。

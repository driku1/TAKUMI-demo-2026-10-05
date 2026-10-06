// Installs the six TAKUMI demo skills for the Codex desktop app
// (%USERPROFILE%\.codex\skills, or $CODEX_HOME/skills) with the path of this
// app folder, and refreshes the copies in skills/ (run from the app folder).
//   node scripts/install-codex-skills.mjs            install + refresh skills/
//   node scripts/install-codex-skills.mjs --project  refresh skills/ only
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const codexSkillsRoot = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'skills');
const projectSkillsRoot = join(appRoot, 'skills');

const consultationExample =
  '樹脂カバーの射出成形で、リブの裏側にヒケが発生します。外観品質を安定させるために、設計と成形条件の両面から改善したいです。';

export const skills = [
  {
    name: 'takumi-launch',
    displayName: 'デモ: ワークスペース起動',
    shortDescription: 'ナレッジ件数とナレッジグラフを右側UIに表示',
    description:
      'TAKUMIデモのナレッジワークスペースを開き、ナレッジ件数・匠の人数・Knowledge Graphを右側UIに表示する。デモ開始時に使う。',
    purpose:
      'TAKUMIのナレッジワークスペースを開き、ナレッジ件数・匠の人数と、Knowledge Graph（製造ナレッジのオントロジー）を右側UIに表示する。',
    prompt: '$takumi-launch を使ってナレッジワークスペースを開いてください。',
  },
  {
    name: 'design-consultation',
    displayName: 'デモ: 設計相談の受付・検索',
    shortDescription: 'ナレッジを検索。登録知見で答えられればそのまま回答',
    description:
      'TAKUMIデモで設計相談を受け付け、初期ナレッジとMerge済みの登録知見を実際に検索して右側UIに表示する。同じ相談や登録知見で答えられる相談は、専門家なしで登録知見だけから回答する。',
    purpose:
      '設計相談を受け付け、初期ナレッジと、人が承認してMergeした登録知見を実際に検索して、取得した知見と不足している知識を右側UIに表示する。同じ相談や、登録知見と既存ナレッジで答えられる相談なら、専門家の選定・質問生成・インタビュー・登録PRを行わず、登録知見だけから回答する。この判定はコマンドが自動で行う。',
    argument:
      'ユーザーの補足文章から相談内容（質問文）を取り出し、--question に渡す。相談文の中の " は削除し、改行は空白にする。相談文がない場合は --question を省略する（樹脂成形のサンプル相談になる）。',
    args: ' --question "相談文"',
    report:
      'mode が knowledge-only の場合は「登録知見だけで回答したため、匠の選定・質問生成・インタビュー・登録PRは不要」と伝え、使った登録知見のIDと根拠を添える。',
    prompt: `$design-consultation ${consultationExample}`,
  },
  {
    name: 'expert-matching',
    displayName: 'デモ: 匠の選定',
    shortDescription: '候補の匠を選び、知見を追加できるところをグラフで強調',
    description:
      'TAKUMIデモで、受け付けた相談に答えられる匠を専門領域と検索結果の執筆者から選び、右側UIのナレッジグラフ全体に候補者の所属と専門を表示する。名前を選ぶと、その人へのインタビューで知見を追加できるところを強調する。',
    purpose:
      '受け付けた相談について、匠の専門領域と検索結果の執筆者を照合して候補を選ぶ。右側UIでは、左にナレッジグラフ全体、右に候補者パネルを表示し、候補者の名前を選ぶと、その人へのインタビューで知見を追加できるところ（想定・未登録）を強調する。',
    prompt: '$expert-matching 不足している判断基準を聞ける匠を選んでください。',
  },
  {
    name: 'interview-plan',
    displayName: 'デモ: 質問計画',
    shortDescription: '既存知見から不足点を整理し、質問に至る流れを表示',
    description:
      'TAKUMIデモで、取得した知見を基にまだ分からない点を整理して匠への最初の質問を作り、ナレッジグラフ全体から質問に至るまでの流れを右側UIで順に表示する。',
    purpose:
      '取得した知見を基に、まだ分からない点を整理して匠への最初の質問を作る。右側UIでは、ナレッジグラフ全体から、参照した既存知見 → まだ分からない点 → 生成した質問、の順に流れを自動で再生する（何を取得したかはKnowledge Searchで表示済み）。この計画は一時的なもので、新しい知見としては登録しない。',
    prompt: '$interview-plan 既存の知見で足りない点を整理して、匠への質問を作ってください。',
  },
  {
    name: 'expert-interview',
    displayName: 'デモ: 匠インタビュー',
    shortDescription: '模擬インタビューを再生し、設計への回答を作成',
    description:
      'TAKUMIデモで、選んだ匠への模擬インタビューを再生し、回答を受けて追加の質問を重ね、設計への回答を右側UIに表示する。',
    purpose:
      '選んだ匠への模擬インタビューを右側UIで再生し（追加の質問は匠の回答を受けて生成）、設計への回答をまとめる。専門家の回答はデモ用に準備した内容。',
    prompt: '$expert-interview 鈴木さんにインタビューして、設計への回答をまとめてください。',
  },
  {
    name: 'knowledge-pr',
    displayName: 'デモ: 知見の登録PR',
    shortDescription: '知見の登録PRを作成（Approve・Mergeは人が画面で）',
    description:
      'TAKUMIデモで、インタビューで得た知見の登録PR（ドラフト）を作成し、右側UIのKnowledge PR画面を開く。マージはしない。Approve reviewとMergeは人が画面で行う。',
    purpose:
      'インタビューで得た知見の登録PR（ドラフト）を作成し、右側UIのKnowledge PR画面を開く。登録には人の承認が必要なため、このスキルではマージしない。',
    report:
      '報告の最後に、発表者が画面で確認チェック → 「Approve review」→「Merge knowledge PR」を押すと知見がナレッジグラフに追加されること、その後の同じ相談・関連する相談は $design-consultation で登録知見だけから回答されることを伝える。',
    prompt: '$knowledge-pr 今回の知見を登録PRにしてください。',
  },
];

function skillMarkdown(skill, command) {
  return `---
name: ${skill.name}
description: ${skill.description}
---

# ${skill.displayName}

${skill.purpose}

${skill.argument ? `${skill.argument}そのうえで、次のコマンドを実行する。` : 'ユーザーの補足文章から対象や説明観点を把握したうえで、次のコマンドを実行する。'}

\`\`\`powershell
${command}${skill.args ?? ''}
\`\`\`

デモサーバーが止まっている場合は、このコマンドが自動で起動する。起動できなかった場合だけ、アプリのフォルダで npm run demo:start を実行してから再実行する。

コマンド成功後は browser:control-in-app-browser を使い、Codexの右側ブラウザを表示する。結果JSONの url（通常は http://127.0.0.1:4173/ ）のタブがあれば再利用し、なければ新しいタブで開く。ブラウザのvisibilityを有効にし、タブをdeliverableとして残す。${
    skill.name === 'takumi-launch'
      ? 'takumi-launchではページを読み込み直して最新の状態を表示する。'
      : 'ページは再読み込みせず、右側の画面が自動で次の工程へ進むのを待って確認する。'
  }

実行結果のJSONの message・screen・next から、処理内容、右側UIで確認する箇所、次に入力するスキルを日本語で簡潔に報告する。artifacts に出力したファイルがあればファイル名を添える。status が skipped の場合は理由を、error の場合は message にある対処を伝える。${skill.report ? `\n\n${skill.report}` : ''}

右側UIは表示用であり、画面のボタンを操作して工程を進めない。特に「Approve review」と「Merge knowledge PR」は人が画面で行う操作なので、絶対にクリックしない。
専門家の回答はデモ用に準備した内容で、AIの生成結果ではない。報告で回答の内容に触れるときはそのことを明記する。
`;
}

const openAiYaml = (skill) => `interface:
  display_name: "${skill.displayName}"
  short_description: "${skill.shortDescription}"
  default_prompt: "${skill.prompt}"

policy:
  allow_implicit_invocation: true
`;

async function write(rootDir, skill, command) {
  const dir = join(rootDir, skill.name);
  await mkdir(join(dir, 'agents'), { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), skillMarkdown(skill, command), 'utf8');
  await writeFile(join(dir, 'agents', 'openai.yaml'), openAiYaml(skill), 'utf8');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectOnly = process.argv.includes('--project');
  for (const skill of skills) {
    // Copy kept with the app: run from the app folder.
    await write(projectSkillsRoot, skill, `node scripts/run-skill.mjs ${skill.name}`);
    if (!projectOnly) {
      await write(codexSkillsRoot, skill, `node "${join(appRoot, 'scripts', 'run-skill.mjs')}" ${skill.name}`);
    }
  }
  console.log(
    projectOnly
      ? `Refreshed ${skills.length} skills in ${projectSkillsRoot}`
      : `Installed ${skills.length} TAKUMI skills to ${codexSkillsRoot}`,
  );
}

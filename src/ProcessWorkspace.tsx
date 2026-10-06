import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitMerge,
  GitPullRequest,
  Pause,
  Play,
  Send,
  Download,
  Network,
  ExternalLink,
  RefreshCcw,
} from "lucide-react";
import { experts, type Expert, type Knowledge, type Scenario } from "./data";
import { buildQuestions, recommendExperts } from "./process-model";
import {
  answerBasis,
  answerReason,
  buildMergedKnowledge,
  canMergeKnowledge,
  shortId,
  sourceLabel,
  type RunContext,
} from "./knowledge-cycle";
import {
  ExpertMatchingMap,
  QuestionStoryMap,
  RetrievalOntology,
} from "./StepGraphs";
import { skillRuntime } from "./skill-runtime";
import "./process-workspace.css";

type Message = Scenario["dialogue"][number];
type Props = {
  query: string;
  /** Prepared run: resolved scenario, search results and first-cycle reuse. */
  run: RunContext;
  /** Knowledge as it was when this run searched (for the step graphs). */
  knowledge: Knowledge[];
  onOpenGraph?: () => void;
  tick: number;
  running: boolean;
  attachments: string[];
  extraMessages: Message[];
  savedId: string | null;
  onToggleRunning: () => void;
  onReset: () => void;
  onArticle: (item: Knowledge) => void;
  onExpert: (expert: Expert) => void;
  onFollowup: (text: string) => void;
  onDownload: () => void;
  onMerge: (item: Knowledge) => void;
  onLibrary: () => void;
  /** Auxiliary ontology shown once the PR is merged. */
  renderMergeGraph?: (savedId: string) => ReactNode;
  /** Graph overlay of the registered knowledge this answer used. */
  renderAnswerGraph?: () => ReactNode;
  /** Codex skill mode: panel a skill asked to show (null follows the live step). */
  followRequest?: { step: number | null; nonce: number };
  /** Codex skill mode: what to do next. */
  skillHint?: string;
  /** Codex skill mode: the consultation waits for the next skill. */
  skillWaiting?: boolean;
};
const stages = [
  { name: "Knowledge Search" },
  { name: "Expert Matching" },
  { name: "Question Plan" },
  { name: "Interview" },
  { name: "Design Response" },
  { name: "Knowledge PR" },
];

export default function ProcessWorkspace(props: Props) {
  const { query, run, tick, running, savedId } = props;
  const { scenario, retrieval } = run;
  // Reuse is shown only when Merged knowledge was actually retrieved and cited.
  const reused = run.cited;
  // Registered knowledge and retrieved notes answer everything: no expert,
  // no interview and no new Knowledge PR.
  const knowledgeOnly = run.mode === "knowledge-only";
  const basis = answerBasis(run);
  const candidates = useMemo(
    () => recommendExperts(scenario, retrieval),
    [scenario, retrieval],
  );
  const questions = buildQuestions(scenario);
  const expert = candidates[0].expert;
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState(0);
  const [followExecution, setFollowExecution] = useState(true);
  const [followup, setFollowup] = useState("");
  const [review, setReview] = useState<"draft" | "changes" | "approved">(
    "draft",
  );
  const [checked, setChecked] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [draft, setDraft] = useState({
    title: scenario.title,
    summary: scenario.insight,
    conditions: scenario.conditions,
  });
  const [mergedMessageCount, setMergedMessageCount] = useState<number | null>(
    null,
  );
  const [draftId] = useState(() => crypto.randomUUID());
  const liveStep =
    tick < 2 ? 0 : tick < 3 ? 1 : tick < 4 ? 2 : tick < 9 ? 3 : 4;
  const activeStep = followExecution ? liveStep : selectedStep;
  const dialogue = [
    ...scenario.dialogue.slice(0, Math.min(Math.max(tick - 2, 0), 6)),
    ...props.extraMessages,
  ];
  const ready = tick >= 9;
  const visibleQuestions = questions.filter(
    (question) => question.availableAt <= tick,
  );
  const validDraft = Object.values(draft).every(
    (value) => value.trim().length > 0,
  );
  const openStep = (index: number, eventId?: string) => {
    setSelectedEventId(eventId ?? null);
    setSelectedStep(index);
    setFollowExecution(false);
  };
  // A skill moved the consultation: show its step.
  useEffect(() => {
    if (!props.followRequest) return;
    if (props.followRequest.step === null) {
      setSelectedEventId(null);
      setFollowExecution(true);
    } else {
      openStep(props.followRequest.step);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.followRequest?.nonce]);
  const editDraft = (field: keyof typeof draft, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setReview("draft");
    setChecked(false);
    setReviewComment("");
  };
  const merge = () => {
    if (!canMergeKnowledge({ ready, savedId, review, checked, validDraft }))
      return;
    setMergedMessageCount(props.extraMessages.length);
    props.onMerge(
      buildMergedKnowledge({
        id: draftId,
        draft,
        scenario,
        expert,
        question: query,
        sourceIds: retrieval.results.map((result) => result.item.id),
        extraDialogue: props.extraMessages,
        reviewComment,
        basedOn: run.cited,
      }),
    );
  };
  const reuseEvents = reused
    ? [
        {
          id: "registered-knowledge",
          tick: 0,
          title: "Registered knowledge found",
          body: `登録知見 ${shortId(reused.id)}`,
          step: 0,
        },
        {
          id: "reuse",
          tick: 9,
          title: "Knowledge reused in answer",
          body: `${run.checks.filter((check) => check.usesKnowledge).length}/${run.checks.length} checks cite ${shortId(reused.id)}`,
          step: 4,
        },
      ]
    : [];
  const knowledgeOnlyEvents = [
    {
      id: "search",
      tick: 0,
      title: "Knowledge retrieved",
      body: `${retrieval.results.length} results from ${retrieval.searchedCount} notes`,
      step: 0,
    },
    {
      id: "registered-knowledge",
      tick: 0,
      title: "Registered knowledge found",
      body: reused
        ? `登録知見 ${shortId(reused.id)}`
        : "",
      step: 0,
    },
    {
      id: "skipped",
      tick: 1,
      title: "Expert interview skipped",
      body: `${basis}で回答可能`,
      step: 1,
    },
    {
      id: "response",
      tick: 9,
      title: "Response compiled",
      body: `${run.checks.length} checks from approved knowledge`,
      step: 4,
    },
  ];
  const events = knowledgeOnly ? knowledgeOnlyEvents : [
    ...reuseEvents,
    {
      id: "search",
      tick: 0,
      title: "Knowledge retrieved",
      body: `${retrieval.results.length} results from ${retrieval.searchedCount} notes`,
      step: 0,
    },
    {
      id: "experts",
      tick: 2,
      title: "Experts matched",
      body: `${candidates.length} candidates · ${expert.name}`,
      step: 1,
    },
    {
      id: "q1",
      tick: 2,
      title: "Question plan ready",
      body: "Questions & generation context",
      step: 2,
    },
    {
      id: "interview",
      tick: 3,
      title: "Interview started",
      body: "Q1 sent · Simulated interview",
      step: 3,
    },
    {
      id: "answered",
      tick: 8,
      title: "Interview completed",
      body: "3 questions · 3 expert answers",
      step: 3,
    },
    {
      id: "response",
      tick: 9,
      title: "Response compiled",
      body: "Recommendations & supporting evidence",
      step: 4,
    },
    {
      id: "pr",
      tick: 9,
      title: "Knowledge PR created",
      body: "1 new note · Review required",
      step: 5,
    },
    ...(review !== "draft"
      ? [
          {
            id: "review",
            tick: 9,
            title:
              review === "approved" ? "Review approved" : "Changes requested",
            body: `${expert.name} · Simulated review`,
            step: 5,
          },
        ]
      : []),
    ...(savedId
      ? [
          {
            id: "merged",
            tick: 9,
            title: "Merged to knowledge base",
            body: "Note & sources saved",
            step: 5,
          },
        ]
      : []),
  ];
  const visibleEvents = events.filter((event) => tick >= event.tick);
  const selectedEvent =
    visibleEvents.find(
      (event) => event.id === selectedEventId && event.step === activeStep,
    ) ??
    [...visibleEvents].reverse().find((event) => event.step === activeStep);
  return (
    <div className="process-workspace">
      <div className="run-context card">
        <div className="run-context-heading">
          <span className="run-id">
            RUN · {(scenario.followUp?.baseScenarioId ?? scenario.id).toUpperCase()}
          </span>
          {reused && <span className="cycle-badge second">登録知見を参照</span>}
          <span className={`run-state ${running ? "working" : ""}`}>
            {savedId
              ? "Merged"
              : ready && knowledgeOnly
                ? "Answered"
                : ready
                ? review === "approved"
                  ? "Ready to merge"
                  : "Pending review"
                : running
                  ? "Running"
                  : props.skillWaiting
                    ? "Waiting for skill"
                    : "Paused"}
          </span>
          <span className="simulation-badge">Simulation</span>
        </div>
        <h2>Request</h2>
        <p>{query}</p>
        {props.attachments.length > 0 && (
          <p className="trace-note">
            添付：{props.attachments.join("、")}（ファイル内容は解析対象外）
          </p>
        )}
        {props.skillHint && (
          <p className="skill-hint" role="status">
            <b>Codex skill</b>
            {props.skillHint}
          </p>
        )}
        <div className="run-controls">
          <span>
            Scenario: {scenario.label} · Keyword routing
            {reused ? " · 登録知見を参照" : ""}
          </span>
          <div>
            {!ready && !props.skillWaiting && (
              <button
                className="secondary-button"
                onClick={props.onToggleRunning}
              >
                {running ? <Pause size={14} /> : <Play size={14} />}{" "}
                {running ? "Pause" : "Resume"}
              </button>
            )}
            <button className="secondary-button" onClick={props.onReset}>
              New consultation
            </button>
          </div>
        </div>
      </div>
      <div className="trace-layout">
        <aside className="card execution-log" aria-label="Activity navigation">
          <div className="execution-log-heading">
            <h2>Activity</h2>
            <span>
              {visibleEvents.length}{" "}
              {visibleEvents.length === 1 ? "event" : "events"}
            </span>
          </div>
          <label className="follow-execution">
            <input
              type="checkbox"
              checked={followExecution}
              onChange={(event) => {
                if (!event.target.checked) setSelectedStep(activeStep);
                setSelectedEventId(null);
                setFollowExecution(event.target.checked);
              }}
            />
            Follow live
          </label>
          <nav
            className="activity-scroll"
            aria-label="Activity outputs"
            tabIndex={0}
          >
            <ol>
              {visibleEvents.map((event) => (
                <li
                  key={event.id}
                  className={selectedEvent?.id === event.id ? "current" : ""}
                >
                  <button
                    aria-current={
                      selectedEvent?.id === event.id ? "step" : undefined
                    }
                    onClick={() => openStep(event.step, event.id)}
                  >
                    <span className="event-dot" />
                    <div>
                      <small>{stages[event.step].name}</small>
                      <strong>{event.title}</strong>
                      <p>{event.body}</p>
                    </div>
                    <ChevronRight size={13} />
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <p className="trace-note">Select an event to inspect its output.</p>
        </aside>

        <section
          className="card trace-panel"
          aria-label={`${stages[activeStep].name} output`}
        >
          <div className="trace-panel-heading">
            <div>
              <span>OUTPUT 0{activeStep + 1}</span>
              <h2>{stages[activeStep].name}</h2>
            </div>
            <span className="output-status">
              {activeStep === 5
                ? savedId
                  ? "Merged"
                  : review === "approved"
                    ? "Approved"
                    : review === "changes"
                      ? "Changes requested"
                      : "Draft"
                : knowledgeOnly && activeStep === 1
                  ? "Skipped"
                  : activeStep === 3 && !ready
                    ? "In progress"
                    : "Ready"}
            </span>
          </div>
          {activeStep === 0 && (
            <>
              <div className="trace-facts">
                <div>
                  <small>Search scope</small>
                  <strong>{retrieval.searchedCount} notes</strong>
                </div>
                <div>
                  <small>Retrieved</small>
                  <strong>{retrieval.results.length} results</strong>
                </div>
                <div>
                  <small>Method</small>
                  <strong>Keyword match</strong>
                </div>
              </div>
              <dl className="query-details">
                <dt>Extracted terms</dt>
                <dd>
                  {retrieval.extracted.join(" / ") || "登録語の直接一致なし"}
                </dd>
                <dt>Expanded terms</dt>
                <dd>{retrieval.expanded.join(" / ")}</dd>
              </dl>
              <p className="trace-note">
                タグ・タイトル・要約で一致した語が多いものから順に表示しています（同じなら新しくMergeした知見が先）。AIの確信度ではありません。
              </p>
              <h3 className="trace-section-heading">
                <Network size={16} /> Retrieval graph
                <small>製造ナレッジ・オントロジー上の検索結果（一時表示）</small>
              </h3>
              <div className="step-graph">
                <RetrievalOntology
                  knowledge={props.knowledge}
                  scenario={scenario}
                  retrieval={retrieval}
                  onArticle={props.onArticle}
                  onOpenGraph={props.onOpenGraph}
                />
              </div>
              {reused && (
                <div className="cycle-callout used" role="status">
                  <RefreshCcw size={16} />
                  <div>
                    <strong>
                      登録済みの知見が検索でヒット
                    </strong>
                    <p>
                      「{reused.title}」ID {reused.id} ·{" "}
                      {reused.provenance?.review.reviewer ?? reused.author}
                      がApprove review後にMerge（模擬）
                    </p>
                    {knowledgeOnly && (
                      <p>
                        {answerReason(run)}そのため、専門家の選定・インタビューは行いません。
                      </p>
                    )}
                  </div>
                </div>
              )}
              <h3 className="trace-section-heading">Retrieved knowledge</h3>
              <div className="retrieved-list">
                {retrieval.results.map((result) => (
                  <button
                    key={result.item.id}
                    className={
                      result.item.id === run.cited?.id ? "cycle-one-hit" : ""
                    }
                    onClick={() => props.onArticle(result.item)}
                  >
                    <div>
                      {result.item.id === run.cited?.id && (
                        <em className="cycle-one-tag">登録知見（Merge済み）</em>
                      )}
                      <strong>{result.item.title}</strong>
                      <p>{result.item.summary}</p>
                      <small>
                        {result.item.id} · {result.item.author} · 一致：
                        {result.matched.join(" / ")}
                      </small>
                    </div>
                    <span className="retrieval-score">
                      <ExternalLink size={13} />
                    </span>
                  </button>
                ))}
              </div>
              <div className="trace-gap">
                <strong>Knowledge gap</strong>
                <p>{scenario.gap}</p>
              </div>
            </>
          )}
          {activeStep === 1 && knowledgeOnly && (
            <div className="skip-panel">
              <p className="trace-intro">
                {answerReason(run)}そのため、専門家の選定・質問生成・インタビューと、新しい知見の登録PRは行いません。
              </p>
              <ul className="skip-coverage">
                {run.checks.map((check) => (
                  <li key={check.id}>
                    <strong>{check.label}</strong>
                    <span>
                      {check.sources.map((source) => sourceLabel(source)).join(" / ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {activeStep === 1 && !knowledgeOnly && (
            <>
              <p className="trace-intro">
                登録された{experts.length}
                名の専門領域と取得記事の執筆者を照合し、関連する上位
                {candidates.length}
                名を候補にしました。ナレッジグラフ全体に候補者の所属と専門を示し、候補者の名前を選ぶと、その人へのインタビューで知見を追加できるところ（想定）を強調します。対話担当は参照シナリオに対応する1名です。
              </p>
              <ExpertMatchingMap
                knowledge={props.knowledge}
                scenario={scenario}
                candidates={candidates}
                onArticle={props.onArticle}
                onExpert={props.onExpert}
                onOpenGraph={props.onOpenGraph}
              />
              <div className="trace-gap">
                <strong>Interview request</strong>
                <p>宛先：{expert.name}（模擬）</p>
                <p>件名：{scenario.title}の判断基準の確認</p>
                <p>確認したい点：{scenario.gap}</p>
                <small>
                  {tick >= 3
                    ? "依頼 → 受諾 → 対話開始（シミュレーション）"
                    : "依頼準備完了"}{" "}
                  · 外部送信なし
                </small>
              </div>
            </>
          )}
          {activeStep === 2 && (
            <>
              <p className="trace-intro">
                検索結果から初回質問を作成し、匠の回答を受け取るごとに追加質問を生成します。ナレッジグラフ全体から、どの知見を取得し、何がまだ分からないと判断して、その質問を作ったかを順にたどれます。
              </p>
              {visibleQuestions.length > 0 && (
                <>
                  <h3 className="trace-section-heading">
                    <Network size={16} /> Question story
                    <small>ナレッジ全体 → 取得した知見 → まだ分からない点 → 質問（一時表示）</small>
                  </h3>
                  <QuestionStoryMap
                    knowledge={props.knowledge}
                    scenario={scenario}
                    retrieval={retrieval}
                    questions={visibleQuestions}
                    onArticle={props.onArticle}
                    onOpenGraph={props.onOpenGraph}
                  />
                </>
              )}
              <div className="question-cards">
                {visibleQuestions.map((question, index) => (
                  <article key={question.id}>
                    <div className="question-title">
                      <strong>{question.id}</strong>
                      <span>
                        {index === 0
                          ? "Initial question"
                          : "Follow-up question"}
                      </span>
                      <small>
                        {tick >= index * 2 + 4
                          ? "Answered"
                          : tick >= index * 2 + 3
                            ? "Sent"
                            : "Generated"}
                      </small>
                    </div>
                    <h3>{question.text}</h3>
                    <dl>
                      <dt>Objective</dt>
                      <dd>{question.purpose}</dd>
                      <dt>Source</dt>
                      <dd>{question.origin}</dd>
                    </dl>
                    <blockquote>{question.trigger}</blockquote>
                    <button
                      className="text-button"
                      disabled={tick < 3}
                      onClick={() => openStep(3)}
                    >
                      View interview <ArrowRight size={14} />
                    </button>
                  </article>
                ))}
              </div>
              {!ready && visibleQuestions.length < 3 && (
                <p className="trace-note">
                  次の質問は、匠の回答を受け取った時点で表示されます。
                </p>
              )}
              <h3 className="trace-section-heading">Verification checklist</h3>
              <ul className="checklist">
                <li>判断を再現できる観察項目・測定方法</li>
                <li>適用できない形状・材料・工程条件</li>
                <li>設計に戻す変更点と、試作で確認する項目</li>
              </ul>
            </>
          )}
          {activeStep === 3 && (
            <>
              <div className="dialogue-meta">
                <strong>TAKUMI Agent ↔ {expert.name}</strong>
                <span>Simulated · {dialogue.length} messages</span>
              </div>
              <div className="trace-dialogue">
                {dialogue.map((message, index) => (
                  <article
                    key={index}
                    className={`trace-message ${message.speaker}`}
                  >
                    <div className="trace-speaker">
                      <span>
                        {index < 6
                          ? `${message.speaker === "ai" ? "Q" : "A"}${Math.floor(index / 2) + 1}`
                          : `追加 ${Math.floor((index - 6) / 2) + 1}`}
                      </span>
                      <strong>
                        {message.speaker === "ai"
                          ? "TAKUMI Agent"
                          : expert.name}
                      </strong>
                      <small>
                        {message.annotation ||
                          (message.speaker === "expert"
                            ? "匠の回答"
                            : "確認質問")}
                      </small>
                    </div>
                    <p>{message.text}</p>
                    {message.speaker === "expert" && index < 5 && (
                      <button
                        className="text-button"
                        onClick={() => openStep(2)}
                      >
                        View follow-up question <ArrowRight size={13} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {running && (
                <p className="trace-note" role="status">
                  Agentが対話を進めています。一時停止して中間出力を確認できます。
                </p>
              )}
              {ready && (
                <form
                  className="trace-followup"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (followup.trim()) {
                      props.onFollowup(followup);
                      setFollowup("");
                      if (!savedId) {
                        setReview("draft");
                        setChecked(false);
                        setReviewComment("");
                      }
                    }
                  }}
                >
                  <label htmlFor="trace-followup">Follow-up question</label>
                  <div>
                    <input
                      id="trace-followup"
                      value={followup}
                      maxLength={1000}
                      onChange={(event) => setFollowup(event.target.value)}
                      placeholder="例：この方法を適用できない条件は？"
                    />
                    <button
                      className="primary-button"
                      disabled={!followup.trim()}
                    >
                      <Send size={15} />
                      Send
                    </button>
                  </div>
                  <small>
                    登録シナリオからの模擬回答です。追加対話は
                    {savedId
                      ? "マージ済みPRには反映されません。"
                      : "PRの出典に含まれます。本文は必要に応じてPRで編集してください。"}
                  </small>
                </form>
              )}
            </>
          )}
          {activeStep === 4 && (
            <>
              {knowledgeOnly && (
                <div className="answer-summary">
                  <span>Answer from approved knowledge</span>
                  <p>{scenario.insight}</p>
                </div>
              )}
              {reused && (
                <section className="reuse-panel used" aria-label="登録知見の活用">
                  <div className="reuse-heading">
                    <RefreshCcw size={17} />
                    <div>
                      <span>Knowledge reuse · 登録知見の活用</span>
                      <strong>
                        {knowledgeOnly
                          ? `${basis}だけで回答（確認事項${run.checks.length}件）`
                          : `登録知見を${run.checks.filter((check) => check.usesKnowledge).length}件の確認事項に使用`}
                      </strong>
                    </div>
                  </div>
                  <button
                    className="reuse-source"
                    onClick={() => props.onArticle(reused)}
                  >
                    <FileText size={16} />
                    <span>
                      <b>{reused.title}</b>
                      <small>
                        ID {reused.id} · {reused.author} · {reused.date}登録 ·{" "}
                        {reused.provenance?.review.reviewer ?? reused.author}
                        が承認（模擬）
                      </small>
                    </span>
                    <ExternalLink size={14} />
                  </button>
                  <h3 className="trace-section-heading">
                    設計上の確認事項と根拠
                  </h3>
                  <ol className="reuse-checks">
                    {run.checks.map((check) => (
                      <li
                        key={check.id}
                        className={
                          check.usesKnowledge
                            ? "uses"
                            : check.sources.some((source) => source.kind === "document")
                              ? "uses-document"
                              : "new"
                        }
                      >
                        <div className="reuse-check-title">
                          <strong>{check.label}</strong>
                          <em>
                            {check.usesKnowledge
                              ? "登録知見を使用"
                              : check.sources.some((source) => source.kind === "document")
                                ? "既存ナレッジを使用"
                                : "今回の対話で追加"}
                          </em>
                        </div>
                        {check.appliedAs && <p>{check.appliedAs}</p>}
                        <ul>
                          {check.sources.map((source, index) => (
                            <li key={index} className={source.kind}>
                              <b>
                                {source.kind === "dialogue"
                                  ? `${sourceLabel(source)} · ${expert.name}`
                                  : sourceLabel(source)}
                              </b>
                              <q>{source.quote}</q>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                  <p className="trace-note">
                    {knowledgeOnly
                      ? `引用は、ブラウザに保存された${basis}の本文から取得しています。今回は専門家への確認を行っていません。`
                      : "引用はブラウザに保存された登録知見の本文から取得しています。専門家の回答はデモ用に準備した内容で、AIの生成結果ではありません。"}
                  </p>
                  {props.renderAnswerGraph && (
                    <div className="answer-graph">
                      <h3 className="trace-section-heading">
                        ナレッジグラフ上で使われた知見
                        <small>重ね表示のみ・グラフには保存しません</small>
                      </h3>
                      {props.renderAnswerGraph()}
                    </div>
                  )}
                </section>
              )}
              {!knowledgeOnly && (
              <>
              <div className="answer-summary">
                <span>Design recommendation</span>
                <p>{scenario.insight}</p>
              </div>
              <div className="answer-items">
                {scenario.recommendations.map((recommendation, index) => (
                  <article key={recommendation.title}>
                    <span>0{index + 1}</span>
                    <div>
                      <h3>{recommendation.title}</h3>
                      <p>{recommendation.body}</p>
                    </div>
                  </article>
                ))}
              </div>
              <details className="answer-evidence" open>
                <summary>Supporting interview</summary>
                {scenario.dialogue
                  .filter((message) => message.speaker === "expert")
                  .map((message, index) => (
                    <blockquote key={index}>
                      <strong>
                        A{index + 1} · {expert.name}
                      </strong>
                      {message.text}
                    </blockquote>
                  ))}
              </details>
              </>
              )}
              <div className="trace-gap">
                <strong>Conditions & limitations</strong>
                <p>{scenario.conditions}</p>
              </div>
              <div className="trace-actions">
                <button className="secondary-button" onClick={props.onDownload}>
                  <Download size={15} />
                  Export response
                </button>
                {knowledgeOnly ? (
                  <span className="trace-note">
                    新しく得た知見はないため、登録PRは作成しません。
                  </span>
                ) : (
                  <button className="primary-button" onClick={() => openStep(5)}>
                    <GitPullRequest size={16} />
                    Open knowledge PR <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </>
          )}
          {activeStep === 5 && (
            <>
              <div className="pr-heading">
                <GitPullRequest size={22} />
                <div>
                  <h3>{draft.title || "ナレッジ登録ドラフト"}</h3>
                  <p>
                    提案者：TAKUMI Agent · レビュアー：{expert.name}（模擬）
                  </p>
                </div>
              </div>
              <div className="pr-branches">
                <code>knowledge/{scenario.id}</code>
                <ArrowRight size={13} />
                <code>knowledge-base / main</code>
                <span>1 new note</span>
              </div>
              <p className="trace-note">
                ローカルの登録PRです。差分確認と模擬レビューの後、マージすると{skillRuntime ? "デモのナレッジベース（runtime/knowledge.json）" : "このブラウザのナレッジベース"}に登録されます。
              </p>
              <details className="pr-similar">
                <summary>
                  重複候補を確認（{retrieval.results.length}件）
                </summary>
                {retrieval.results.map((result) => (
                  <button
                    className="source-link"
                    key={result.item.id}
                    onClick={() => props.onArticle(result.item)}
                  >
                    <FileText size={14} />
                    {result.item.title}
                  </button>
                ))}
                <p>
                  既存記事を更新するか新規追加するかは実運用ではレビュー対象です。このデモは新規追加を扱います。
                </p>
              </details>
              <h3 className="trace-section-heading">
                Changes <small>New file / Editable draft</small>
              </h3>
              <div className="pr-diff">
                <div className="diff-file">
                  <FileText size={14} /> knowledge/{scenario.id}/
                  {draftId.slice(0, 8)}.md <span>+ 新規</span>
                </div>
                {(["title", "summary", "conditions"] as const).map((field) => (
                  <label key={field}>
                    <span className="diff-plus">+</span>
                    <span>
                      {field === "title"
                        ? "Title"
                        : field === "summary"
                          ? "Summary"
                          : "Conditions"}
                      {field === "title" ? (
                        <input
                          value={draft[field]}
                          disabled={!!savedId}
                          maxLength={160}
                          onChange={(event) =>
                            editDraft(field, event.target.value)
                          }
                        />
                      ) : (
                        <textarea
                          value={draft[field]}
                          disabled={!!savedId}
                          maxLength={3000}
                          onChange={(event) =>
                            editDraft(field, event.target.value)
                          }
                        />
                      )}
                    </span>
                  </label>
                ))}
                <div className="diff-static">
                  <span className="diff-plus">+</span>
                  <div>
                    <strong>Recommendations</strong>
                    {scenario.recommendations.map((item) => (
                      <p key={item.title}>
                        {item.title}：{item.body}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="diff-static">
                  <span className="diff-plus">+</span>
                  <div>
                    <strong>Sources & provenance</strong>
                    <p>元の依頼：{query}</p>
                    <p>
                      参照記事：
                      {retrieval.results
                        .map((result) => result.item.id)
                        .join(", ")}
                    </p>
                    {run.cited && (
                      <p>
                        発展元（参照した登録知見）：{run.cited.title}（
                        {shortId(run.cited.id)}）。上書きせず、新しいノートとして追加します。
                      </p>
                    )}
                    <p>
                      対話：Q1〜A3
                      {(mergedMessageCount ?? props.extraMessages.length) > 0
                        ? `、追加${mergedMessageCount ?? props.extraMessages.length}メッセージ`
                        : ""}{" "}
                      · {expert.name}
                    </p>
                  </div>
                </div>
              </div>
              <section className="pr-review" aria-label="登録PRのレビュー">
                <h3>Review</h3>
                <div className="pr-checks">
                  <span>
                    <CheckCircle2 size={15} />
                    {retrieval.results.length}件の出典を添付
                  </span>
                  <span>
                    <CheckCircle2 size={15} />
                    対話ログを添付
                  </span>
                  <span>
                    {validDraft ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <FileText size={15} />
                    )}
                    必須項目：{validDraft ? "入力済み" : "未入力あり"}
                  </span>
                </div>
                {!savedId && (
                  <>
                    <label className="review-checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setChecked(event.target.checked);
                          if (!event.target.checked) setReview("draft");
                        }}
                      />
                      出典・適用条件・重複候補を確認した
                    </label>
                    <div className="review-controls">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setReview("changes");
                          setChecked(false);
                          setReviewComment(
                            "適用条件と既存記事との差分を確認し、必要な内容を追記してください。",
                          );
                        }}
                      >
                        Request changes
                      </button>
                      <button
                        className="secondary-button"
                        disabled={
                          !checked || !validDraft || review === "approved"
                        }
                        onClick={() => {
                          setReview("approved");
                          setReviewComment(
                            "出典との対応と適用条件を確認しました。試作での検証を前提とする参考知見として登録を承認します。",
                          );
                        }}
                      >
                        Approve review
                      </button>
                    </div>
                  </>
                )}
                {reviewComment && (
                  <div className={`review-comment ${review}`}>
                    <strong>
                      {expert.name} ·{" "}
                      {review === "changes" ? "修正依頼" : "承認"}（模擬）
                    </strong>
                    <p>{reviewComment}</p>
                  </div>
                )}
                <div className="merge-bar">
                  <div>
                    <strong>
                      {savedId
                        ? "Merged to knowledge base"
                        : review === "approved" && checked
                          ? "Ready to merge"
                          : "Approval required"}
                    </strong>
                    <small>
                      {savedId
                        ? `登録ID：${savedId.slice(0, 8)}`
                        : "編集や追加対話がある場合は再承認が必要です。"}
                    </small>
                  </div>
                  {savedId ? (
                    <button
                      className="primary-button"
                      onClick={props.onLibrary}
                    >
                      View in library <ArrowRight size={15} />
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      disabled={
                        !canMergeKnowledge({
                          ready,
                          savedId,
                          review,
                          checked,
                          validDraft,
                        })
                      }
                      onClick={merge}
                    >
                      <GitMerge size={16} />
                      Merge knowledge PR
                    </button>
                  )}
                </div>
                {savedId && (
                  <div className="merge-graph">
                    <div className="merge-graph-heading">
                      <Network size={17} />
                      <div>
                        <strong>追加された知見と接続先</strong>
                        <small>
                          Knowledge Graphと同じデータから作成した補助表示です。接続は自動で行い、接続先を選ぶ操作はありません。
                        </small>
                      </div>
                    </div>
                    {props.renderMergeGraph?.(savedId)}
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

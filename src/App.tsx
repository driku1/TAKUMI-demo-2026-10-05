import { useState, useEffect, useMemo, useRef } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Network,
  LayoutDashboard,
  Users,
  BookOpen,
  ChevronRight,
  Sparkles,
  Paperclip,
  X,
  CheckCheck,
  MessageSquare,
  FileText,
  Download,
  HelpCircle,
  ShieldCheck,
  Lightbulb,
  Layers,
  Menu,
  CheckCircle2,
} from "lucide-react";
import {
  allScenarios,
  experts,
  scenarios,
  followUpScenarios,
  baseScenarioOf,
  matchScenario,
  initialKnowledge,
  mergeKnowledge,
  type Expert,
  type Knowledge,
  type Scenario,
} from "./data";

import ProcessWorkspace from "./ProcessWorkspace";
import {
  fetchSkillKnowledge,
  fetchSkillState,
  nextSkillHint,
  postMerge,
  skillRuntime,
  type SkillState,
} from "./skill-runtime";
import OntologyGraph from "./OntologyGraph";
import {
  KNOWLEDGE_STORAGE_KEY,
  addKnowledgeOnce,
  buildUsageRecord,
  answerBasis,
  prepareRun,
  shortId,
  sourceLabel,
  type KnowledgeUsage,
} from "./knowledge-cycle";

const filterLabels: Record<string, string> = {
  すべて: "All",
  今回保存した知見: "Saved notes",
  製品設計: "Product design",
  工程設計: "Process design",
  製造: "Manufacturing",
  品質改善: "Quality",
  切削加工: "Machining",
  溶接変形: "Welding",
  射出成形: "Molding",
  "材料・接合": "Materials & joining",
  "金型・成形": "Tooling & molding",
  "品質・計測": "Quality & metrology",
  "自動化・保全": "Automation & maintenance",
  "生産・組立": "Production & assembly",
};

type Page = "home" | "graph" | "experts" | "library";
const steps = [
  ["ナレッジ検索", "検索結果・根拠を確認"],
  ["匠の推薦", "候補と推薦理由を確認"],
  ["質問生成", "質問の狙いと生成根拠"],
  ["インタビュー", "Agentと匠の対話"],
  ["回答・登録PR", "レビュー後にマージ"],
  ["登録知見の活用", "次の相談で使われたかを確認"],
];
function readKnowledge(): Knowledge[] {
  try {
    const raw = JSON.parse(
      localStorage.getItem(KNOWLEDGE_STORAGE_KEY) || "null",
    );
    return Array.isArray(raw) &&
      raw.every(
        (x) =>
          typeof x?.id === "string" &&
          typeof x?.title === "string" &&
          typeof x?.summary === "string" &&
          Array.isArray(x?.tags) &&
          typeof x?.author === "string",
      )
      ? mergeKnowledge(raw)
      : initialKnowledge;
  } catch {
    return initialKnowledge;
  }
}
function Avatar({
  expert,
  small = false,
}: {
  expert: Expert;
  small?: boolean;
}) {
  return (
    <span className={`avatar ${expert.color} ${small ? "small" : ""}`}>
      <span>{expert.initials}</span>
      <i />
    </span>
  );
}
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [query, setQuery] = useState("");
  const [scenario, setScenario] = useState<Scenario>(scenarios[0]);
  const [browseScenario, setBrowseScenario] = useState<Scenario>(scenarios[0]);
  const [selectedExample, setSelectedExample] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(-1);
  // Codex skill mode keeps Merged knowledge on the demo server; otherwise the browser.
  const [knowledge, setKnowledge] = useState<Knowledge[]>(() =>
    skillRuntime ? mergeKnowledge(skillRuntime.knowledge) : readKnowledge(),
  );
  // How far the consultation plays: 9 = to the end; a skill stops it at its step.
  const [targetTick, setTargetTick] = useState(9);
  const [followRequest, setFollowRequest] = useState<
    { step: number | null; nonce: number } | undefined
  >(undefined);
  const [skillState, setSkillState] = useState<SkillState | null>(null);
  const [runKnowledge, setRunKnowledge] = useState<Knowledge[]>(knowledge);
  const [runId, setRunId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [modal, setModal] = useState<"help" | "export" | null>(null);
  const [exportContent, setExportContent] = useState("");
  const [expertDetail, setExpertDetail] = useState<Expert | null>(null);
  const [article, setArticle] = useState<Knowledge | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("すべて");
  const filteredKnowledge = knowledge.filter(
    (item) =>
      filter === "すべて" ||
      (filter === "今回保存した知見" ? item.isNew : item.tags.includes(filter)),
  );
  const filteredExperts = experts.filter(
    (expert) => filter === "すべて" || expert.category === filter,
  );
  const profileScenario = scenarios.find(
    (item) => item.expertId === expertDetail?.id,
  );
  const relatedExpertTag = expertDetail?.tags.find((tag) =>
    knowledge.some((item) => item.tags.includes(tag)),
  );
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [extraMessages, setExtraMessages] = useState<
    { speaker: "ai" | "expert"; text: string; annotation?: string }[]
  >([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useMemo(
    () => prepareRun({ query, scenario, knowledge: runKnowledge }),
    [query, scenario, runKnowledge],
  );
  const activeExpert = experts.find((x) => x.id === scenario.expertId)!;
  // How the answer on screen used registered knowledge. Session only: it is
  // drawn over the graph (④) and cleared with the consultation, never saved.
  const answerUsage = useMemo<KnowledgeUsage | null>(
    () =>
      tick >= 9 && runId
        ? buildUsageRecord(run, { runId, question: query })
        : null,
    [tick, runId, run, query],
  );
  const dialogOpen = Boolean(modal || expertDetail || article);
  // Answers built only from approved knowledge skip expert matching and the
  // interview, so they finish after the search instead of after the dialogue.
  const quickAnswer = run.mode === "knowledge-only";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () =>
        setTick((v) => {
          if (v >= targetTick) {
            setRunning(false);
            return v;
          }
          const next = v >= 8 || (quickAnswer && v >= 1) ? 9 : v + 1;
          if (next >= targetTick) setRunning(false);
          return next;
        }),
      1800,
    );
    return () => clearInterval(timer);
  }, [running, quickAnswer, targetTick]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3600);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setExpertDetail(null);
        setArticle(null);
        setSidebarOpen(false);
        setSearch("");
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (!dialogOpen) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      dialog.removeEventListener("keydown", trapFocus);
    };
  }, [dialogOpen]);
  const navigate = (p: Page) => {
    window.scrollTo({ top: 0 });
    setPage(p);
    setSearch("");
    setSidebarOpen(false);
    setFilter("すべて");
  };
  const begin = () => {
    if (!query.trim()) {
      setToast("相談したい内容を入力するか、サンプルを選んでください。");
      return;
    }
    const matched = matchScenario(query);
    setRunKnowledge([...knowledge]);
    setScenario(matched);
    setBrowseScenario(baseScenarioOf(matched));
    setRunId(crypto.randomUUID());
    setTargetTick(9);
    setRunning(true);
    setTick(0);
    setSavedId(null);
    setExtraMessages([]);
  };
  const reset = () => {
    window.scrollTo({ top: 0 });
    setSidebarOpen(false);
    setSearch("");
    setRunning(false);
    setTick(-1);
    setTargetTick(9);
    setQuery("");
    setSelectedExample(null);
    setAttachments([]);
    setSavedId(null);
    setExtraMessages([]);
    setRunId(null);
    setPage("home");
  };
  /** Prepares a consultation without running it (sample chips, graph, profile). */
  const prepareConsultation = (next: Scenario) => {
    reset();
    setQuery(next.question);
    setScenario(next);
    setSelectedExample(next.id);
  };
  const save = async (item: Knowledge) => {
    if (savedId) return;
    if (skillRuntime) {
      if (!(await postMerge(item, runId))) {
        setToast("登録できませんでした。デモサーバー（npm run demo:start）が動いているか確認してください。");
        return;
      }
      setKnowledge((current) => addKnowledgeOnce(current, item));
      setSavedId(item.id);
      setToast("登録PRをマージし、ナレッジライブラリに追加しました。");
      return;
    }
    const next = addKnowledgeOnce(knowledge, item);
    setKnowledge(next);
    setSavedId(item.id);
    try {
      localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(next));
      setToast("登録PRをマージし、ナレッジライブラリに追加しました。");
    } catch {
      setToast(
        "このセッションに保存しました。ブラウザへの永続保存はできませんでした。",
      );
    }
  };
  // Codex skill mode: follow the step each skill moved the consultation to.
  const runIdRef = useRef(runId);
  runIdRef.current = runId;
  const knowledgeRef = useRef(knowledge);
  knowledgeRef.current = knowledge;
  const tickRef = useRef(tick);
  tickRef.current = tick;
  const pageRef = useRef(page);
  pageRef.current = page;
  const seen = useRef({
    revision: 0,
    resetAt: skillRuntime?.state.resetAt,
    lastSkillAt: skillRuntime?.state.lastSkill?.at,
    knowledgeRevision: skillRuntime?.state.knowledgeRevision,
  });
  const applySkillState = async (state: SkillState, initial: boolean) => {
    if (state.revision <= seen.current.revision) return;
    seen.current.revision = state.revision;
    let current = knowledgeRef.current;
    if (state.knowledgeRevision !== seen.current.knowledgeRevision) {
      const stored = await fetchSkillKnowledge();
      if (stored) {
        current = mergeKnowledge(stored);
        knowledgeRef.current = current;
        setKnowledge(current);
      }
      seen.current.knowledgeRevision = state.knowledgeRevision;
    }
    setSkillState(state);
    if (!initial && state.resetAt !== seen.current.resetAt) {
      seen.current.resetAt = state.resetAt;
      runIdRef.current = null;
      reset();
    }
    const skillRan = state.lastSkill?.at !== seen.current.lastSkillAt;
    seen.current.lastSkillAt = state.lastSkill?.at;
    const consultation = state.consultation;
    const asked = consultation
      ? allScenarios.find((item) => item.id === consultation.scenarioId)
      : undefined;
    if (consultation && asked && consultation.id !== runIdRef.current) {
      runIdRef.current = consultation.id;
      setQuery(consultation.question);
      setScenario(asked);
      setBrowseScenario(baseScenarioOf(asked));
      setSelectedExample(null);
      setAttachments([]);
      setRunKnowledge(
        current.filter(
          (item) => !item.isNew || consultation.knowledgeIds.includes(item.id),
        ),
      );
      setRunId(consultation.id);
      setSavedId(consultation.merged ?? null);
      setExtraMessages([]);
      setTick(initial ? consultation.targetTick : 0);
      setTargetTick(consultation.targetTick);
      setRunning(!initial && consultation.targetTick > 0);
      setFollowRequest({ step: consultation.step, nonce: Date.now() });
    } else if (consultation && consultation.id === runIdRef.current) {
      setTargetTick(consultation.targetTick);
      if (tickRef.current < consultation.targetTick) setRunning(true);
      if (consultation.merged) setSavedId(consultation.merged);
      if (skillRan) setFollowRequest({ step: consultation.step, nonce: Date.now() });
    }
    if (initial || skillRan) {
      if (state.screen === "graph") {
        setBrowseScenario(
          scenarios.find((item) => item.id === state.graphScenarioId) ?? scenarios[2],
        );
        if (pageRef.current !== "graph") navigate("graph");
      } else if (state.screen === "consultation" && pageRef.current !== "home") {
        navigate("home");
      }
    }
    if (!initial && skillRan && state.lastSkill) {
      setToast(
        state.lastSkill.status === "success"
          ? `Skill完了: ${state.lastSkill.name}`
          : state.lastSkill.message,
      );
    }
  };
  useEffect(() => {
    if (!skillRuntime) return;
    let busy = false;
    void applySkillState(skillRuntime.state, true);
    const timer = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      const state = await fetchSkillState();
      if (state) await applySkillState(state, false);
      busy = false;
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const skillConsultation =
    skillState?.consultation && skillState.consultation.id === runId
      ? skillState.consultation
      : null;
  const download = () => {
    const reuse = run.scenario.followUp || run.cited
      ? `\n\n## 登録知見の活用\n${
          run.cited
            ? `使用した登録知見：${run.cited.title}（ID ${run.cited.id}）\n\n${run.checks
                .map(
                  (check) =>
                    `- ${check.label}：${check.appliedAs || check.sources[0]?.quote}（根拠：${check.sources
                      .map((source) =>
                        sourceLabel(source),
                      )
                      .join(" + ")}）`,
                )
                .join("\n")}`
            : "登録知見は使用していません。"
        }`
      : "";
    if (run.mode === "knowledge-only") {
      setExportContent(
        `# ${query}\n\nデモシミュレーション / ${answerBasis(run)}から作成（専門家への追加確認なし）\n\n## 回答\n${run.summary}${reuse}\n\n## 適用条件\n${run.scenario.conditions}`,
      );
      setModal("export");
      return;
    }
    const content = `# ${scenario.title}\n\nデモシミュレーション / 実務適用前に専門家レビューが必要\n\n## 相談内容\n${query}${reuse}\n\n## 抽出された知見\n${scenario.insight}\n\n## 設計への提案\n${scenario.recommendations.map((r) => `### ${r.title}\n${r.body}`).join("\n\n")}\n\n## 出典\n${activeExpert.name}との模擬インタビュー\n\n## 適用条件\n${scenario.conditions}\n\n## 対話記録\n${[...run.scenario.dialogue, ...extraMessages].map((m) => `${m.speaker === "ai" ? "AI" : activeExpert.name}: ${m.text}`).join("\n\n")}`;
    setExportContent(content);
    setModal("export");
  };
  const downloadFile = () => {
    const url = URL.createObjectURL(
      new Blob([exportContent], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `TAKUMI-${scenario.id}-設計フィードバック.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setToast("設計フィードバックのダウンロードを開始しました。");
  };
  const askFollowup = (text: string) => {
    if (!text.trim()) return;
    const answer = /失敗|注意|例外|リスク|適用できない|適用条件|限界/.test(text)
      ? scenario.conditions
      : /数値|公差|何mm|締付/.test(text)
        ? "具体的な数値は、部品形状・設備・要求公差によって変わります。このデモでは確定できません。まず比較試験の条件と評価指標を決め、試作結果を添えて担当の専門家に確認してください。"
        : `「${text.trim()}」について、参考シナリオでは「${scenario.recommendations[2].body}」を確認項目としています。自由入力への回答は登録済みの知見を使うシミュレーションです。追加の判断には実際の匠への確認が必要です。`;
    setExtraMessages((v) => [
      ...v,
      { speaker: "ai", text: text.trim(), annotation: "設計者からの追加質問" },
      { speaker: "expert", text: answer },
    ]);
  };
  const matches = knowledge.filter((k) =>
    `${k.title}${k.tags.join("")}${k.summary}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const expertMatches = experts.filter((e) =>
    `${e.name} ${e.reading} ${e.tags.join(" ")} ${e.role} ${e.focus}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="メニューを閉じる"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${sidebarOpen ? "open" : ""}`}
        inert={dialogOpen}
      >
        <div className="workspace">
          <span className="workspace-icon">
            <Layers size={18} />
          </span>
          <div>
            Manufacturing<small>ものづくり事業部</small>
          </div>
          <span className="workspace-dot" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {(
            [
              { id: "home", label: "Consultations", icon: LayoutDashboard },
              { id: "graph", label: "Knowledge Graph", icon: Network },
              { id: "experts", label: "Experts", icon: Users },
              { id: "library", label: "Knowledge Library", icon: BookOpen },
            ] as const
          ).map((n) => (
            <button
              className={`nav-item ${page === n.id ? "active" : ""}`}
              key={n.id}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "library" ? (
                <span className="nav-count">{knowledge.length}</span>
              ) : page === n.id ? (
                <span className="active-dot" />
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-label">YOUR SPACE</div>
        <button className="nav-item new-consult" onClick={reset}>
          <Plus size={18} />
          <span>New consultation</span>
        </button>
        <div className="sidebar-bottom">
          <button className="sidebar-help" onClick={() => setModal("help")}>
            <HelpCircle size={17} />
            Demo guide
            <ArrowUpRight size={15} />
          </button>
          <div className="profile">
            <div className="user-avatar">山</div>
            <div>
              山田 太郎<small>製品設計部</small>
            </div>
            <span className="profile-badge">DEMO</span>
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={dialogOpen}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="メニューを開く"
              aria-expanded={sidebarOpen}
              aria-controls="workspace-navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {
                {
                  home: "Consultations",
                  graph: "Knowledge Graph",
                  experts: "Experts",
                  library: "Knowledge Library",
                }[page]
              }
            </strong>
          </div>
          <div className="topbar-right">
            <div className="global-search">
              <Search size={16} />
              <input
                aria-label="ナレッジ・匠を検索"
                placeholder="Search knowledge & experts"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search ? (
                <button
                  className="icon-button"
                  aria-label="検索をクリア"
                  onClick={() => setSearch("")}
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd>Search</kbd>
              )}
            </div>
            <span className="demo-pill">
              <i />
              Demo
            </span>
            <button
              className="icon-button help-top"
              aria-label="デモについて"
              onClick={() => setModal("help")}
            >
              <HelpCircle size={19} />
            </button>
          </div>
          {search && (
            <div className="search-popover">
              <div className="eyebrow">
                検索結果 · {matches.length + expertMatches.length}件
              </div>
              {!matches.length && !expertMatches.length ? (
                <p className="muted">
                  一致するナレッジ・匠が見つかりませんでした。
                </p>
              ) : (
                <>
                  {matches.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => {
                        setArticle(k);
                        setSearch("");
                      }}
                    >
                      <BookOpen size={17} />
                      <span>
                        {k.title}
                        <small>{k.tags.join(" / ")}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {expertMatches.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setExpertDetail(e);
                        setSearch("");
                      }}
                    >
                      <Users size={17} />
                      <span>
                        {e.name}
                        <small>{e.role}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </header>
        <main>
          <div hidden={page !== "home"}>
            <>
              <PageHeading
                title="Consultations"
                description="課題を入力し、Agentの検索・推薦・対話・登録結果を確認します。"
              />
              {tick >= 0 ? (
                <ProcessWorkspace
                  key={runId ?? `${scenario.id}:${query}`}
                  query={query}
                  run={run}
                  knowledge={runKnowledge}
                  onOpenGraph={() => {
                    setBrowseScenario(baseScenarioOf(scenario));
                    navigate("graph");
                  }}
                  tick={tick}
                  running={running}
                  savedId={savedId}
                  attachments={attachments.map((file) => file.name)}
                  extraMessages={extraMessages}
                  followRequest={followRequest}
                  skillHint={
                    skillConsultation ? nextSkillHint(skillConsultation) : undefined
                  }
                  skillWaiting={
                    Boolean(skillConsultation) && !running && tick < 9 && tick >= targetTick
                  }
                  onToggleRunning={() => setRunning((value) => !value)}
                  onReset={reset}
                  onArticle={setArticle}
                  onExpert={setExpertDetail}
                  onFollowup={askFollowup}
                  onDownload={download}
                  onMerge={save}
                  onLibrary={() => {
                    navigate("library");
                    setFilter("今回保存した知見");
                  }}
                  renderMergeGraph={(id) => (
                    <OntologyGraph
                      variant="inline"
                      knowledge={knowledge}
                      scenario={baseScenarioOf(scenario)}
                      initialStage="focus"
                      focusKnowledgeId={id}
                      onOpenGraph={() => {
                        setBrowseScenario(baseScenarioOf(scenario));
                        navigate("graph");
                      }}
                    />
                  )}
                  renderAnswerGraph={() =>
                    answerUsage ? (
                      <OntologyGraph
                        variant="inline"
                        knowledge={knowledge}
                        overlay={answerUsage}
                        scenario={baseScenarioOf(scenario)}
                        initialStage="usage"
                        focusKnowledgeId={answerUsage.usedKnowledge[0].id}
                        onOpenGraph={() => {
                          setBrowseScenario(baseScenarioOf(scenario));
                          navigate("graph");
                        }}
                      />
                    ) : null
                  }
                />
              ) : (
                <>
                  <div className="work-grid">
                    <section className="card consultation-card">
                      <div className="card-header">
                        <div className="section-title">
                          <span className="section-icon orange">
                            <MessageSquare size={18} />
                          </span>
                          <h2>New consultation</h2>
                        </div>
                        <span className="micro-label">
                          {tick < 0
                            ? "NEW CONSULTATION"
                            : running
                              ? "AGENT WORKING"
                              : "CONSULTATION COMPLETE"}
                        </span>
                      </div>

                      <>
                        <div className="consult-body">
                          <p className="card-description">
                            対象部品、発生している問題、確認したい条件を入力してください。
                          </p>
                          <div className="query-box">
                            <textarea
                              aria-label="相談内容"
                              value={query}
                              onChange={(e) => {
                                setQuery(e.target.value);
                                setSelectedExample(null);
                              }}
                              placeholder={
                                "例：薄肉のアルミ部品で、加工後に反りが出てしまう。\n寸法精度を安定させるには、どんな工夫ができる？"
                              }
                              maxLength={2000}
                            />
                            <div className="query-bottom">
                              <button
                                className="attachment-button"
                                onClick={() => fileRef.current?.click()}
                              >
                                <Paperclip size={16} />
                                Attach files
                              </button>
                              <span>{query.length} / 2,000</span>
                            </div>
                          </div>
                          <input
                            type="file"
                            multiple
                            hidden
                            ref={fileRef}
                            accept=".pdf,.png,.jpg,.jpeg,.step,.stp,.stl,.iges,.igs,.dwg,.dxf"
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              if (
                                files.some((f) => f.size > 20 * 1024 * 1024)
                              ) {
                                setToast(
                                  "ファイルは1件20MB以下で選択してください。",
                                );
                              }
                              setAttachments((v) =>
                                [
                                  ...v,
                                  ...files.filter(
                                    (f) => f.size <= 20 * 1024 * 1024,
                                  ),
                                ].slice(0, 5),
                              );
                              e.target.value = "";
                            }}
                          />
                          {attachments.length > 0 && (
                            <div className="attachments">
                              {attachments.map((f, i) => (
                                <span key={i}>
                                  <FileText size={13} />
                                  {f.name}
                                  <button
                                    aria-label={`${f.name}を削除`}
                                    onClick={() =>
                                      setAttachments((v) =>
                                        v.filter((_, j) => j !== i),
                                      )
                                    }
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              ))}
                              <small>
                                添付は最大5件・各20MB。デモでは名称のみ使用し、ファイルの解析・送信は行いません。
                              </small>
                            </div>
                          )}
                          <div className="sample-label">
                            <Lightbulb size={14} />
                            Sample questions
                          </div>
                          <div className="sample-chips">
                            {[
                              ...scenarios,
                              ...followUpScenarios.filter(
                                (item) => item.id === "molding-c2",
                              ),
                            ].map((s) => (
                              <button
                                className={
                                  selectedExample === s.id ? "selected" : ""
                                }
                                key={s.id}
                                onClick={() => {
                                  setQuery(s.question);
                                  setScenario(s);
                                  setSelectedExample(s.id);
                                }}
                              >
                                {s.label}
                                <ArrowUpRight size={13} />
                              </button>
                            ))}
                          </div>
                          <div className="consult-action">
                            <span>
                              <ShieldCheck size={14} />
                              検索 → 推薦 → 対話 → レビュー
                            </span>
                            <button className="primary-button" onClick={begin}>
                              <Sparkles size={16} />
                              Run agent
                              <ArrowRight size={16} />
                            </button>
                          </div>
                        </div>
                        <div className="card-footnote">
                          <span className="tiny-dot" />
                          このデモではサンプル知識・架空の匠を使って、AIの動きを体験できます。
                        </div>
                      </>
                    </section>
                    <section className="card graph-card">
                      <div className="card-header">
                        <div className="section-title">
                          <span className="section-icon green">
                            <Network size={18} />
                          </span>
                          <h2>Knowledge graph</h2>
                        </div>
                        <button
                          className="icon-button"
                          title="ナレッジグラフを開く"
                          aria-label="ナレッジグラフを開く"
                          onClick={() => navigate("graph")}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </div>
                      <div className="graph-subtitle">
                        選択中のテーマを中心に、組織・技術観点・ドキュメント・登録知見のつながりを表示
                      </div>
                      <OntologyGraph
                        variant="card"
                        knowledge={knowledge}
                        overlay={answerUsage}
                        scenario={baseScenarioOf(scenario)}
                      />
                      <div className="graph-footer">
                        <span>
                          <i className="legend-dot blue" />
                          組織・匠
                        </span>
                        <span>
                          <i className="legend-dot purple" />
                          工程・技術観点
                        </span>
                        <span>
                          <i className="legend-dot green" />
                          ドキュメント・登録知見
                        </span>
                        <button onClick={() => navigate("graph")}>
                          Explore graph
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </section>
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>Experts</h2>
                      <p>
                        {tick < 0
                          ? "専門領域と対応可能なテーマを確認できます。"
                          : `「${scenario.label}」に関連する専門家 · マッチングはデモの参考値です。`}
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("experts")}
                    >
                      View all experts
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="expert-grid">
                    {[...experts]
                      .sort((a, b) =>
                        a.id === scenario.expertId
                          ? -1
                          : b.id === scenario.expertId
                            ? 1
                            : 0,
                      )
                      .slice(0, 3)
                      .map((e) => (
                        <ExpertCard
                          key={e.id}
                          expert={e}
                          onClick={() => setExpertDetail(e)}
                        />
                      ))}
                  </div>
                  <div className="section-heading recent-heading">
                    <div>
                      <h2>Recent knowledge</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("library")}
                    >
                      Open library
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="knowledge-list">
                    {knowledge.slice(0, 3).map((k) => (
                      <KnowledgeRow
                        key={k.id}
                        item={k}
                        onClick={() => setArticle(k)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          </div>
          {page === "home" ? null : page === "graph" ? (
            <>
              <PageHeading
                title="Knowledge Graph"
                description="組織と製品・ナレッジのオントロジーで、登録した知見がどこにつながり、次の相談でどう使われたかを確認します。"
              />
              <div className="page-toolbar">
                <div className="filter-tabs">
                  {scenarios.map((s) => (
                    <button
                      key={s.id}
                      className={browseScenario.id === s.id ? "active" : ""}
                      onClick={() => setBrowseScenario(s)}
                      disabled={running}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <span className="muted">ノードをクリックして関係と詳細を表示</span>
              </div>
              <div className="full-graph ontology-page">
                <OntologyGraph
                  variant="page"
                  knowledge={knowledge}
                  overlay={answerUsage}
                  scenario={browseScenario}
                  onArticle={setArticle}
                />
              </div>
              <div className="graph-insight-grid">
                <div className="card info-card">
                  <Network size={21} />
                  <h3>グラフの関係定義</h3>
                  <p>
                    組織（部署・チーム・匠）と、製品・ナレッジ（工程領域・対象部品・技術観点・ドキュメント）を分けて表示します。線の名称は「所属」「担当」「執筆」「参照」「適用条件」「回答に使用」などの関係で、タグや語の一致は点線の「タグ一致」「本文で言及」として区別し、因果関係としては扱いません。
                  </p>
                </div>
                <div className="card info-card">
                  <Lightbulb size={21} />
                  <h3>未確認の判断基準</h3>
                  <p>{browseScenario.gap}</p>
                  <div className="info-card-actions">
                    <button
                      className="text-button"
                      disabled={running}
                      onClick={() => prepareConsultation(browseScenario)}
                    >
                      このテーマで相談する
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : page === "experts" ? (
            <>
              <PageHeading
                title="Experts"
                description="専門領域で絞り込み、経歴と保有知識を確認します。"
              />
              <div className="page-toolbar">
                <div className="filter-tabs">
                  {[
                    "すべて",
                    "切削加工",
                    "材料・接合",
                    "金型・成形",
                    "品質・計測",
                    "自動化・保全",
                    "生産・組立",
                  ].map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "active" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {filterLabels[f] ?? f}
                    </button>
                  ))}
                </div>
                <span
                  className="muted"
                  style={{ whiteSpace: "nowrap" }}
                  aria-live="polite"
                >
                  {filter === "すべて"
                    ? `${experts.length} experts`
                    : `${filteredExperts.length} / ${experts.length} experts`}
                </span>
              </div>
              <div className="expert-grid directory">
                {filteredExperts.map((e) => (
                  <ExpertCard
                    key={e.id}
                    expert={e}
                    onClick={() => setExpertDetail(e)}
                    expanded
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <PageHeading
                title="Knowledge Library"
                description="技術ノートと、登録PRから追加した知見を検索・参照します。"
              />
              <div className="page-toolbar">
                <div className="filter-tabs">
                  {[
                    "すべて",
                    "今回保存した知見",
                    "製品設計",
                    "工程設計",
                    "製造",
                    "品質改善",
                    "切削加工",
                    "溶接変形",
                    "射出成形",
                  ].map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "active" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {filterLabels[f] ?? f}
                    </button>
                  ))}
                </div>
                <span
                  className="muted"
                  style={{ whiteSpace: "nowrap" }}
                  aria-live="polite"
                >
                  {filter === "すべて"
                    ? `${knowledge.length}件のナレッジ`
                    : `${filteredKnowledge.length}件 / 全${knowledge.length}件`}
                </span>
              </div>
              <div className="library-list">
                {filteredKnowledge.map((k) => (
                  <KnowledgeRow
                    key={k.id}
                    item={k}
                    onClick={() => setArticle(k)}
                  />
                ))}
                {filteredKnowledge.length === 0 && (
                  <div className="empty-state">
                    <BookOpen size={32} />
                    <h3>これから、知見が蓄積されていきます。</h3>
                    <p>
                      相談の登録PRでレビュー後に「マージして登録」を押すと、ここに追加されます。
                    </p>
                    <button
                      className="primary-button"
                      onClick={() => navigate("home")}
                    >
                      相談画面へ
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
              <p className="storage-note">
                <ShieldCheck size={14} />
                保存した知見はこのブラウザに保存されます。表示内容はすべてデモ用で、専門家の承認前の参考情報です。
              </p>
            </>
          )}
          <footer className="page-footer">
            <span>TAKUMI · Accenture</span>
            <span>ローカルデモ · サンプルデータ</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button aria-label="通知を閉じる" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {(modal || expertDetail || article) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setModal(null);
            setExpertDetail(null);
            setArticle(null);
          }}
        >
          <section
            className={`modal ${expertDetail ? "expert-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              expertDetail
                ? `${expertDetail.name}のプロフィール`
                : article
                  ? article.title
                  : modal === "export"
                    ? "設計フィードバックの書き出し"
                    : "デモの使い方"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="modal-close icon-button"
              aria-label="閉じる"
              onClick={() => {
                setModal(null);
                setExpertDetail(null);
                setArticle(null);
              }}
            >
              <X size={21} />
            </button>
            {expertDetail ? (
              <>
                <div className="eyebrow">MEET THE EXPERT</div>
                <div className="expert-detail-head">
                  <Avatar expert={expertDetail} />
                  <div>
                    <h2>
                      {expertDetail.name}
                      <span>さん</span>
                    </h2>
                    <p>{expertDetail.role}</p>
                  </div>
                </div>
                <blockquote>「{expertDetail.quote}」</blockquote>
                <div className="expert-detail-metrics">
                  <div>
                    <strong>
                      {expertDetail.years}
                      <small>年</small>
                    </strong>
                    <span>現場経験</span>
                  </div>
                  <div>
                    <strong>
                      {expertDetail.contribution}
                      <small>件</small>
                    </strong>
                    <span>知見の提供（サンプル）</span>
                  </div>
                </div>
                <div className="tag-list">
                  {expertDetail.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <h3>この匠に聞けること</h3>
                <p className="modal-body-copy">{expertDetail.focus}</p>
                <div className="expert-availability">
                  <span className="tiny-dot" />
                  {profileScenario
                    ? "Interview demo available"
                    : "Profile demo"}
                  <span>Sample</span>
                </div>
                <button
                  className="primary-button full-width"
                  disabled={running || (!profileScenario && !relatedExpertTag)}
                  onClick={() => {
                    if (!profileScenario) {
                      navigate("library");
                      setSearch(relatedExpertTag ?? "");
                      setExpertDetail(null);
                      return;
                    }
                    const s = profileScenario;
                    prepareConsultation(s);
                    setExpertDetail(null);
                    setToast(
                      "相談内容を用意しました。「Run agent」から模擬インタビューを開始できます。",
                    );
                  }}
                >
                  <MessageSquare size={16} />
                  {profileScenario
                    ? "Start consultation"
                    : relatedExpertTag
                      ? "Browse related knowledge"
                      : "No linked notes yet"}
                  <ArrowRight size={16} />
                </button>
                <p className="modal-fineprint">
                  架空のプロフィールです。実際の連絡・依頼は送信されません。
                </p>
              </>
            ) : modal === "export" ? (
              <>
                <div className="eyebrow">EXPORT KNOWLEDGE</div>
                <h2>設計チームに、知見を持ち帰る。</h2>
                <p className="modal-body-copy">
                  設計への提案・適用条件・対話記録をMarkdown形式にまとめました。
                  ファイルを保存するか、下のテキストを選択してコピーできます。
                </p>
                <textarea
                  className="export-preview"
                  aria-label="書き出し内容"
                  readOnly
                  value={exportContent}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  className="primary-button full-width"
                  onClick={downloadFile}
                >
                  <Download size={16} />
                  Markdownをダウンロード
                </button>
                <p className="modal-fineprint">
                  お使いのブラウザで保存が始まらない場合は、上のテキストをコピーしてご利用ください。
                </p>
              </>
            ) : article ? (
              <>
                <div className="eyebrow">
                  KNOWLEDGE NOTE{" "}
                  <span className="simulation-badge">デモ知識</span>
                </div>
                <h2 className="article-title">{article.title}</h2>
                <div className="tag-list">
                  {article.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <div className="article-meta">
                  <Users size={15} />
                  {article.author}
                  <span>·</span>
                  {article.date}
                </div>
                <h3>Summary</h3>
                <p className="article-summary">{article.summary}</p>
                {article.recommendations?.map((r) => (
                  <div className="article-recommendation" key={r.title}>
                    <h3>{r.title}</h3>
                    <p>{r.body}</p>
                  </div>
                ))}
                <div className="gap-box">
                  <ShieldCheck size={18} />
                  <p>
                    {article.conditions ||
                      "サンプルとして登録された参考知識です。実際の部品・設備に適用する前に、専門家レビューと試作で確認してください。"}
                  </p>
                </div>
                {article.provenance && (
                  <div className="article-provenance">
                    <h3>Review & sources</h3>
                    <p>
                      レビュー：{article.provenance.review.reviewer}（模擬） ·
                      マージ済み
                    </p>
                    <p>{article.provenance.review.comment}</p>
                    <p>
                      登録日時：
                      {new Date(
                        article.provenance.review.mergedAt,
                      ).toLocaleString("ja-JP")}
                    </p>
                    {article.provenance.basedOn?.map((source) => (
                      <p key={source.id} className="article-cycle">
                        発展元（参照した登録知見）：
                        {knowledge.find((item) => item.id === source.id)
                          ?.title ?? `${source.title}（現在は見つかりません）`}
                        （{shortId(source.id)}）
                      </p>
                    ))}
                    <details>
                      <summary>
                        参照したナレッジ（{article.provenance.sourceIds.length}
                        件）
                      </summary>
                      <ul>
                        {article.provenance.sourceIds.map((id) => (
                          <li key={id}>
                            {knowledge.find((item) => item.id === id)?.title ||
                              id}
                          </li>
                        ))}
                      </ul>
                    </details>
                    <details>
                      <summary>元の依頼と対話記録</summary>
                      <p>{article.provenance.question}</p>
                      {article.provenance.dialogue.map((message, index) => (
                        <p key={index}>
                          <strong>
                            {message.speaker === "ai"
                              ? "Agent"
                              : article.author}
                            ：
                          </strong>
                          {message.text}
                        </p>
                      ))}
                    </details>
                  </div>
                )}
                <div className="article-source">
                  <CheckCheck size={16} />
                  出典：
                  {article.isNew
                    ? "TAKUMIの模擬インタビュー"
                    : "社内技術ノート（サンプル）"}
                  <span>
                    {article.provenance ? "模擬レビュー済み" : "要レビュー"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="eyebrow">DEMO GUIDE</div>
                <h2>デモの操作手順</h2>
                <p className="modal-body-copy">
                  このデモでは、AIが知識の不足を見つけ、専門家への深掘り質問から知見を形式知化する流れを体験できます。
                </p>
                <ol className="help-steps">
                  {steps.map((s, i) => (
                    <li key={s[0]}>
                      <span>{i + 1}</span>
                      <div>
                        <strong>{s[0]}</strong>
                        <p>
                          {
                            [
                              "入力質問から検索語を抽出し、取得記事と一致理由を確認します。検索結果はナレッジグラフ上の位置でも表示します。",
                              "専門領域と参照記事から推薦理由を確認します。ナレッジグラフ全体で候補者の名前を選ぶと、その人へのインタビューで知見を追加できるところ（想定）を強調します。",
                              "初回質問と、匠の回答から生成した追加質問を確認します。ナレッジグラフ全体から、取得した知見・まだ分からない点・質問へと至る流れを順に再生します。",
                              "約16秒で模擬対話を再生。一時停止と追加質問に対応。",
                              "設計提案と登録PRの差分を確認し、模擬レビュー後にマージします。マージ後は追加された知見と接続先を補助グラフで確認できます。",
                              "同じ相談をもう一度したり、登録した知見に関係する質問をしたりすると、検索でヒットした登録知見がIDと本文の引用つきで回答に使われます（ヒットしなければ使ったことにしません）。登録知見と既存ナレッジで答えられる場合は、専門家の選定・インタビュー・登録PRを省いてすぐに回答します。Knowledge Graphの①〜④で、登録前・追加後・注目・回答での活用を比較できます。",
                            ][i]
                          }
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="demo-explanation">
                  <strong>デモの範囲</strong>
                  <p>
                    AI処理・マッチング・対話は、登録済みのシナリオによるシミュレーションです。専門家の回答はデモ用に準備した内容です。ナレッジグラフには人が承認してMergeした知見だけが追加されます。検索結果・匠の選定・質問計画のグラフ上の強調と想定は表示中だけの一時表示で、保存しません。自由入力はキーワードで参照シナリオに振り分けます。実際のAI
                    API・社内データベース・メッセージ送信サービスには接続していません。添付ファイルの内容は解析しません。
                  </p>
                </div>
                <button
                  className="primary-button full-width"
                  onClick={() => setModal(null)}
                >
                  体験をはじめる
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function PageHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading secondary-heading tool-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
function ExpertCard({
  expert,
  rank,
  onClick,
  expanded = false,
}: {
  expert: Expert;
  rank?: number;
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      className={`expert-card ${expanded ? "expanded" : ""}`}
      onClick={onClick}
    >
      <div className="expert-card-top">
        <Avatar expert={expert} />
        <div className="expert-identity">
          <div className="expert-name">
            {expert.name}
            <span>さん</span>
          </div>
          <p>{expert.role}</p>
        </div>
        {rank !== undefined ? (
          <div className={`match-score ${rank === 0 ? "best" : ""}`}>
            <span>関連度 · デモ</span>
            <strong>
              {[98, 86, 79][rank]}
              <small>%</small>
            </strong>
          </div>
        ) : (
          <ArrowUpRight size={18} />
        )}
      </div>
      <div className="tag-list">
        {expert.tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {expanded && <blockquote>「{expert.quote}」</blockquote>}
      <div className="expert-card-footer">
        <span>
          <span className="experience-dot" />
          現場経験<strong>{expert.years}年</strong>
        </span>
        <span>
          {expanded ? "プロフィールを見る" : "匠について知る"}
          <ArrowUpRight size={14} />
        </span>
      </div>
    </button>
  );
}
function KnowledgeRow({
  item,
  onClick,
}: {
  item: Knowledge;
  onClick: () => void;
}) {
  return (
    <button className="knowledge-row" onClick={onClick}>
      <span className="knowledge-file">
        <FileText size={20} />
      </span>
      <div className="knowledge-row-main">
        <h3>
          {item.title}
          {item.isNew && <em>NEW</em>}
        </h3>
        <div>
          {item.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
          <span className="knowledge-author">{item.author}の知見</span>
        </div>
      </div>
      <span className="knowledge-date">{item.date}</span>
      <ArrowUpRight size={17} />
    </button>
  );
}

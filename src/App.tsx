import { useState, useEffect, useRef } from "react";
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
  Maximize2,
  HelpCircle,
  ShieldCheck,
  Lightbulb,
  Target,
  Layers,
  Menu,
  CheckCircle2,
} from "lucide-react";
import {
  experts,
  scenarios,
  matchScenario,
  initialKnowledge,
  mergeKnowledge,
  type Expert,
  type Knowledge,
  type Scenario,
} from "./data";

import ProcessWorkspace from "./ProcessWorkspace";

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
];
function readKnowledge(): Knowledge[] {
  try {
    const raw = JSON.parse(localStorage.getItem("takumi-knowledge") || "null");
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
  const [knowledge, setKnowledge] = useState<Knowledge[]>(readKnowledge);
  const [runKnowledge, setRunKnowledge] = useState<Knowledge[]>(knowledge);
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
  const stage = tick < 0 ? 0 : tick < 2 ? 1 : tick < 3 ? 2 : tick < 9 ? 3 : 4;
  const activeExpert = experts.find((x) => x.id === scenario.expertId)!;
  const dialogOpen = Boolean(modal || expertDetail || article);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () =>
        setTick((v) => {
          if (v >= 8) {
            setRunning(false);
            return 9;
          }
          return v + 1;
        }),
      1800,
    );
    return () => clearInterval(timer);
  }, [running]);
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
    setRunKnowledge([...knowledge]);
    setScenario(matchScenario(query));
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
    setQuery("");
    setSelectedExample(null);
    setAttachments([]);
    setSavedId(null);
    setExtraMessages([]);
    setPage("home");
  };
  const save = (item: Knowledge) => {
    if (savedId) return;
    const next = [item, ...knowledge];
    setKnowledge(next);
    setSavedId(item.id);
    try {
      localStorage.setItem("takumi-knowledge", JSON.stringify(next));
      setToast("登録PRをマージし、ナレッジライブラリに追加しました。");
    } catch {
      setToast(
        "このセッションに保存しました。ブラウザへの永続保存はできませんでした。",
      );
    }
  };
  const download = () => {
    const content = `# ${scenario.title}\n\nデモシミュレーション / 実務適用前に専門家レビューが必要\n\n## 相談内容\n${query}\n\n## 抽出された知見\n${scenario.insight}\n\n## 設計への提案\n${scenario.recommendations.map((r) => `### ${r.title}\n${r.body}`).join("\n\n")}\n\n## 出典\n${activeExpert.name}との模擬インタビュー\n\n## 適用条件\n${scenario.conditions}\n\n## 対話記録\n${[...scenario.dialogue, ...extraMessages].map((m) => `${m.speaker === "ai" ? "AI" : activeExpert.name}: ${m.text}`).join("\n\n")}`;
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
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <img
            className="accenture-logo"
            src="/brand/accenture-white.svg"
            alt="Accenture"
            width="138"
            height="36"
          />
          <div className="product-wordmark">
            TAKUMI<small>Manufacturing Intelligence</small>
          </div>
        </a>
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
                  query={query}
                  scenario={scenario}
                  knowledge={runKnowledge}
                  tick={tick}
                  running={running}
                  savedId={savedId}
                  attachments={attachments.map((file) => file.name)}
                  extraMessages={extraMessages}
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
                            {scenarios.map((s) => (
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
                        選択中のサンプルに関連する技術・課題・専門家
                      </div>
                      <KnowledgeGraph scenario={scenario} stage={stage} />
                      <div className="graph-footer">
                        <span>
                          <i className="legend-dot green" />
                          技術・ノウハウ
                        </span>
                        <span>
                          <i className="legend-dot orange" />
                          課題
                        </span>
                        <span>
                          <i className="legend-dot blue" />匠
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
                description="テーマを選択し、技術・課題・専門家の関係を確認します。"
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
                <span className="muted">ノードをクリックして詳細を表示</span>
              </div>
              <div className="card full-graph">
                <KnowledgeGraph scenario={browseScenario} stage={4} large />
              </div>
              <div className="graph-insight-grid">
                <div className="card info-card">
                  <Network size={21} />
                  <h3>グラフの関係定義</h3>
                  <p>
                    「課題 → 関連技術 → 対応ノウハウ →
                    経験を持つ匠」の関係で、点在する社内知識を構造化しています。
                  </p>
                </div>
                <div className="card info-card">
                  <Lightbulb size={21} />
                  <h3>未確認の判断基準</h3>
                  <p>{browseScenario.gap}</p>
                  <button
                    className="text-button"
                    disabled={running}
                    onClick={() => {
                      reset();
                      setQuery(browseScenario.question);
                      setScenario(browseScenario);
                      setSelectedExample(browseScenario.id);
                    }}
                  >
                    このテーマで相談する
                    <ArrowRight size={14} />
                  </button>
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
                    reset();
                    setQuery(s.question);
                    setScenario(s);
                    setSelectedExample(s.id);
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
                              "入力質問から検索語を抽出し、取得記事と一致理由を確認します。",
                              "専門領域と参照記事から推薦理由を確認します。",
                              "初回質問と、匠の回答から生成した追加質問を確認します。",
                              "約16秒で模擬対話を再生。一時停止と追加質問に対応。",
                              "設計提案と登録PRの差分を確認し、模擬レビュー後にマージします。",
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
                    AI処理・マッチング・対話は3つの登録済みシナリオによるシミュレーションです。自由入力はキーワードで参照シナリオに振り分けます。実際のAI
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
function KnowledgeGraph({
  scenario,
  stage,
  large = false,
}: {
  scenario: Scenario;
  stage: number;
  large?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => setSelected(null), [scenario.id]);
  const expert = experts.find((e) => e.id === scenario.expertId)!;
  const nodes = [
    {
      x: 257,
      y: 168,
      r: 37,
      label:
        scenario.id === "aluminum"
          ? "加工変形"
          : scenario.id === "welding"
            ? "溶接ひずみ"
            : "ヒケ対策",
      type: "issue",
      detail:
        "設計・製造で解決したい課題。関連する材料、工程、経験を持つ匠へとつながっています。",
    },
    {
      x: 129,
      y: 100,
      r: 27,
      label: scenario.tags[0],
      type: "tech",
      detail: scenario.recommendations[0].body,
    },
    {
      x: 155,
      y: 246,
      r: 30,
      label: scenario.id === "molding" ? "リブ設計" : "治具設計",
      type: "tech",
      detail: scenario.recommendations[0].body,
    },
    {
      x: 358,
      y: 89,
      r: 27,
      label:
        scenario.id === "welding"
          ? "入熱管理"
          : scenario.id === "molding"
            ? "保圧条件"
            : "残留応力",
      type: "tech",
      detail: scenario.recommendations[1].body,
    },
    {
      x: 386,
      y: 227,
      r: 28,
      label: scenario.id === "molding" ? "金型設計" : "加工順序",
      type: "tech",
      detail: scenario.recommendations[1].body,
    },
    {
      x: 286,
      y: 298,
      r: 25,
      label: expert.name,
      type: "person",
      detail: `${expert.role}。現場経験${expert.years}年。${expert.quote}`,
    },
    {
      x: 73,
      y: 202,
      r: 17,
      label: scenario.id === "molding" ? "充填性" : "寸法精度",
      type: "muted",
      detail: scenario.recommendations[2].body,
    },
    {
      x: 249,
      y: 49,
      r: 18,
      label: scenario.id === "molding" ? "樹脂材料" : "材料特性",
      type: "muted",
      detail:
        "材料の状態と履歴は、加工や成形の結果に影響するため、条件と一緒に記録します。",
    },
    {
      x: 454,
      y: 143,
      r: 17,
      label: "品質改善",
      type: "muted",
      detail: "改善前後の条件と評価値を記録し、再現できる知識に整理します。",
    },
  ];
  const edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 2],
    [1, 7],
    [1, 6],
    [2, 6],
    [2, 5],
    [3, 7],
    [3, 4],
    [3, 8],
    [4, 8],
    [4, 5],
  ];
  return (
    <div className={`knowledge-graph ${large ? "large" : ""}`}>
      <div className="graph-top-label">
        <span className="tiny-dot" />
        {stage > 0 ? "関連ナレッジを表示中" : "ナレッジマップ"}
        <span>9 NODES · 15 LINKS</span>
      </div>
      <svg
        viewBox="0 0 520 355"
        role="img"
        aria-label={`${scenario.label}に関連する技術・課題・匠のナレッジグラフ`}
      >
        <defs>
          <radialGradient id={large ? "glow-large" : "glow"}>
            <stop offset="0%" stopColor="#A100FF" stopOpacity=".14" />
            <stop offset="100%" stopColor="#A100FF" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(260 177) scale(${zoom}) translate(-260 -177)`}>
          <circle
            cx="257"
            cy="168"
            r="145"
            fill={`url(#${large ? "glow-large" : "glow"})`}
          />
          {edges.map(([a, b], i) => (
            <g key={i}>
              <line
                x1={nodes[a].x}
                y1={nodes[a].y}
                x2={nodes[b].x}
                y2={nodes[b].y}
                className={`graph-edge ${selected === a || selected === b ? "highlight" : ""}`}
                strokeDasharray={a === 0 ? undefined : "3 4"}
              />
              {large && a === 0 && (
                <text
                  x={(nodes[a].x + nodes[b].x) / 2}
                  y={(nodes[a].y + nodes[b].y) / 2 - 5}
                  className="edge-label"
                >
                  {b === 5 ? "経験を持つ" : "関連する"}
                </text>
              )}
            </g>
          ))}
          {nodes.map((n, i) => (
            <g
              key={i}
              className={`graph-node ${n.type} ${selected === i ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${n.label}の詳細`}
              onClick={() => setSelected(selected === i ? null : i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(selected === i ? null : i);
                }
              }}
            >
              <circle className="node-halo" cx={n.x} cy={n.y} r={n.r + 6} />
              <circle className="node-circle" cx={n.x} cy={n.y} r={n.r} />
              {n.type === "issue" ? (
                <g transform={`translate(${n.x - 9} ${n.y - 9})`}>
                  <Target size={18} />
                </g>
              ) : n.type === "person" ? (
                <g transform={`translate(${n.x - 8} ${n.y - 8})`}>
                  <Users size={16} />
                </g>
              ) : (
                <g transform={`translate(${n.x - 7} ${n.y - 7})`}>
                  <Layers size={14} />
                </g>
              )}
              <text x={n.x} y={n.y + n.r + 20} textAnchor="middle">
                {n.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
      {selected !== null && (
        <div className="node-detail">
          <button
            aria-label="ノード詳細を閉じる"
            onClick={() => setSelected(null)}
          >
            <X size={13} />
          </button>
          <strong>{nodes[selected].label}</strong>
          <p>{nodes[selected].detail}</p>
        </div>
      )}
      <div className="graph-controls">
        <button
          title="拡大"
          aria-label="グラフを拡大"
          disabled={zoom >= 1.6}
          onClick={() => setZoom((v) => Math.min(1.6, v + 0.2))}
        >
          <Plus size={15} />
        </button>
        <button
          title="縮小"
          aria-label="グラフを縮小"
          disabled={zoom <= 0.6}
          onClick={() => setZoom((v) => Math.max(0.6, v - 0.2))}
        >
          <span>−</span>
        </button>
        <span />
        <button
          title="表示をリセット"
          aria-label="グラフの表示をリセット"
          onClick={() => {
            setZoom(1);
            setSelected(null);
          }}
        >
          <Maximize2 size={13} />
        </button>
      </div>
      <div className="graph-hint">ノードを選択して、つながりを探索</div>
    </div>
  );
}

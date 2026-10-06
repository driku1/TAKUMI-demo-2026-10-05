import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Pause,
  Play,
} from "lucide-react";
import type { Expert, Knowledge, Scenario } from "./data";
import type { recommendExperts, retrieveKnowledge } from "./process-model";
import OntologyGraph, { LineSample, stepLineStyles } from "./OntologyGraph";
import {
  buildOntology,
  candidateOverview,
  expertSpotlight,
  questionStory,
  retrievalProjection,
  type PlannedQuestion,
} from "./ontology";

/*
 * Ontology views for the consultation steps. Each one draws part of the
 * approved ontology with the step's temporary items on top; none of them
 * adds anything to the Knowledge Graph or to the saved knowledge.
 */

type Retrieval = ReturnType<typeof retrieveKnowledge>;
type Candidate = ReturnType<typeof recommendExperts>[number];
/** How long each step of the Question Plan story stays on screen. */
export const STORY_STEP_MS = 4200;
type Common = {
  /** Knowledge as it was when the search ran. */
  knowledge: Knowledge[];
  scenario: Scenario;
  onArticle: (item: Knowledge) => void;
  onOpenGraph?: () => void;
};

function StepLegend({
  items,
}: {
  items: { color: string; dash?: string; label: string }[];
}) {
  return (
    <div className="onto-step-legend">
      {items.map((item) => (
        <span key={item.label}>
          <LineSample color={item.color} dash={item.dash} round={item.dash === "2 5"} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function OpenGraph({ onOpenGraph }: { onOpenGraph?: () => void }) {
  return onOpenGraph ? (
    <button type="button" className="text-button" onClick={onOpenGraph}>
      Knowledge Graphで全体を見る <ArrowRight size={14} />
    </button>
  ) : null;
}

/** Knowledge Search: what was retrieved, and where it sits in the ontology. */
export function RetrievalOntology({
  knowledge,
  scenario,
  retrieval,
  onArticle,
  onOpenGraph,
}: Common & { retrieval: Retrieval }) {
  const projection = useMemo(
    () => retrievalProjection({ knowledge, scenario, retrieval }),
    [knowledge, scenario, retrieval],
  );
  const byNode = new Map<string, { label: string; typeLabel: string; terms: string[] }>();
  for (const item of projection.terms) {
    const entry = byNode.get(item.nodeId) ?? {
      label: item.label,
      typeLabel: item.typeLabel,
      terms: [],
    };
    entry.terms.push(item.term);
    byNode.set(item.nodeId, entry);
  }
  return (
    <OntologyGraph
      variant="inline"
      knowledge={knowledge}
      scenario={scenario}
      projection={projection}
      onArticle={onArticle}
      aside={
        <>
          <strong>
            検索語と観点ノードの対応 <small>（語の一致です。因果関係ではありません）</small>
          </strong>
          <StepLegend
            items={[
              { ...stepLineStyles.search, label: "検索語一致（一時表示・保存しない）" },
              { color: "#a3abba", dash: "4 4", label: "タグ一致・本文で言及（登録済みの関係）" },
              { color: "#8a94a6", label: "構造・包含（登録済みの関係）" },
            ]}
          />
          <ul>
            {[...byNode.entries()].map(([id, entry]) => (
              <li key={id}>
                <i style={{ background: stepLineStyles.search.color }} />
                <span>
                  <b>{entry.typeLabel}：{entry.label}</b>
                  検索語：{entry.terms.join(" / ")}
                </span>
              </li>
            ))}
          </ul>
          {projection.outside.length > 0 && (
            <p className="onto-step-note">
              グラフ外の検索結果（このテーマのグラフにノードがないため一覧のみ）：
              {projection.outside
                .map((item) => `${item.rank}位 ${item.title}`)
                .join(" / ")}
            </p>
          )}
          <p className="onto-step-note">
            右側の知見は一致した語が多い順に上から並べ、カードの「一致」に一致した検索語を表示しています。カードを選ぶと本文を表示します。
            {projection.themeTerms.length > 0 &&
              `工程領域全体の語（${projection.themeTerms.join("・")}）は線にせず、カードの「一致」にだけ表示しています。`}
          </p>
          <OpenGraph onOpenGraph={onOpenGraph} />
        </>
      }
    />
  );
}

/** Expert Matching: the whole map, the candidates, and where one of them can add knowledge. */
export function ExpertMatchingMap({
  knowledge,
  scenario,
  candidates,
  onArticle,
  onExpert,
  onOpenGraph,
}: Common & { candidates: Candidate[]; onExpert: (expert: Expert) => void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const view = useMemo(
    () => buildOntology({ knowledge, scenario, stage: "after" }),
    [knowledge, scenario],
  );
  const overview = useMemo(
    () => candidateOverview({ view, scenario, candidates }),
    [view, scenario, candidates],
  );
  const spotlights = useMemo(
    () =>
      new Map(
        candidates.map((candidate) => [
          candidate.expert.id,
          expertSpotlight({ view, scenario, candidate }),
        ]),
      ),
    [view, scenario, candidates],
  );
  const current = chosen === null ? undefined : spotlights.get(chosen);
  const person = candidates.find((candidate) => candidate.expert.id === chosen);
  const byPerson = new Map(
    [...spotlights].map(([id, spotlight]) => [spotlight.personId, id]),
  );
  const choose = (id: number) => setChosen((value) => (value === id ? null : id));
  const article = (id: string) => knowledge.find((item) => item.id === id);
  return (
    <div className="spot-wrap">
      <div className="spot-layout">
        <div className="spot-graph">
          <OntologyGraph
            variant="embed"
            initialStage="after"
            knowledge={knowledge}
            scenario={scenario}
            spotlight={current ?? overview}
            caption={
              person
                ? `${person.expert.name}：インタビューで知見を追加できるところ（想定）`
                : `候補の匠 ${candidates.length}名 — 名前を選ぶと強調します`
            }
            onArticle={onArticle}
            onNodeClick={(node) => {
              const id = byPerson.get(node.id);
              if (id === undefined) return false;
              choose(id);
              return true;
            }}
          />
          <StepLegend
            items={[
              { ...stepLineStyles.expected, label: "想定される関係（一時表示・保存しない）" },
              { color: "#3976f6", label: "所属・専門・執筆（登録済みの関係）" },
              { color: "#8a94a6", label: "構造・包含（登録済みの関係）" },
            ]}
          />
        </div>
        <aside className="spot-panel" aria-label="候補の匠">
          <strong className="spot-panel-title">
            候補の匠 {candidates.length}名
            <small>名前を選ぶと、その人へのインタビューで知見を追加できるところをナレッジグラフで強調します（想定・未登録）。</small>
          </strong>
          <ol className="candidate-picker">
            {candidates.map((candidate, index) => {
              const open = candidate.expert.id === chosen;
              const spotlight = spotlights.get(candidate.expert.id)!;
              return (
                <li key={candidate.expert.id} className={open ? "open" : ""}>
                  <button
                    type="button"
                    className="candidate-pick"
                    aria-pressed={open}
                    onClick={() => choose(candidate.expert.id)}
                  >
                    <span className="candidate-rank">0{index + 1}</span>
                    <span>
                      <b>{candidate.expert.name}</b>
                      <small>
                        {candidate.expert.role} · 経験{candidate.expert.years}年
                      </small>
                    </span>
                    <em className={candidate.selected ? "chosen" : ""}>
                      {candidate.selected ? "対話担当" : "候補"}
                    </em>
                  </button>
                  {open && (
                    <div className="candidate-detail">
                      <p>{candidate.reason}</p>
                      <dl>
                        <dt>専門（グラフ上の観点）</dt>
                        <dd className="trace-tags">
                          {spotlight.specialties.length > 0
                            ? spotlight.specialties.map((item) => (
                                <span key={item.id}>
                                  {item.label}
                                  {item.domain && <small>（{item.domain}）</small>}
                                </span>
                              ))
                            : candidate.expert.tags.map((tag) => <span key={tag}>{tag}</span>)}
                        </dd>
                        <dt>知見を追加できるところ（想定）</dt>
                        <dd>
                          <ul className="candidate-targets">
                            {spotlight.targets.map((target) => (
                              <li key={target.id}>
                                <i style={{ background: stepLineStyles.expected.color }} />
                                {target.typeLabel}：{target.label}
                              </li>
                            ))}
                            <li className="expected">
                              <i />
                              想定される知見：{spotlight.extraNodes[0].label}（未登録）
                            </li>
                          </ul>
                        </dd>
                        {spotlight.notes.length > 0 && (
                          <>
                            <dt>本人の知見（{spotlight.notes.length}件）</dt>
                            <dd>
                              {spotlight.notes.slice(0, 4).map((note) => {
                                const item = article(note.id);
                                return (
                                  <button
                                    key={note.id}
                                    type="button"
                                    className="source-link"
                                    disabled={!item}
                                    onClick={() => item && onArticle(item)}
                                  >
                                    <FileText size={13} />
                                    {note.title}
                                    {note.retrieved && <em>検索で取得</em>}
                                  </button>
                                );
                              })}
                            </dd>
                          </>
                        )}
                      </dl>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onExpert(candidate.expert)}
                      >
                        View profile <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="onto-step-note">
            想定は専門領域タグ・担当業務・検索で見つかった本人の知見から作ったもので、回答の内容を予測するものではありません。登録PRをApprove・Mergeした内容だけがナレッジグラフに入ります。
          </p>
          <OpenGraph onOpenGraph={onOpenGraph} />
        </aside>
      </div>
    </div>
  );
}

/** Question Plan: the story from the whole map to each generated question. */
export function QuestionStoryMap({
  knowledge,
  scenario,
  retrieval,
  questions,
  onArticle,
  onOpenGraph,
}: Common & { retrieval: Retrieval; questions: PlannedQuestion[] }) {
  const ids = questions.map((item) => item.id).join(",");
  const steps = useMemo(
    () => questionStory({ knowledge, scenario, retrieval, questions }),
    // Questions appear one by one; the list is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [knowledge, scenario, retrieval, ids],
  );
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  // The first step waits for the camera to come in from the whole map.
  const firstStepMs = STORY_STEP_MS + 900;
  const last = steps.length - 1;
  const at = Math.min(index, last);
  const step = steps[at];
  useEffect(() => {
    if (!playing) return;
    if (at >= last) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setIndex(at + 1), at === 0 ? firstStepMs : STORY_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, at, last, firstStepMs]);
  const go = (next: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, next)));
  };
  return (
    <div className="spot-wrap">
      <div className="spot-layout">
        <div className="spot-graph">
          <OntologyGraph
            variant="embed"
            initialStage="after"
            knowledge={knowledge}
            scenario={scenario}
            spotlight={step.spotlight}
            caption={`${at + 1}/${steps.length} ${step.title}`}
            onArticle={onArticle}
            introWhole
          />
          <StepLegend
            items={[
              { ...stepLineStyles.plan, label: "既存知見 → 確認したい点 → 質問（一時表示・保存しない）" },
              { color: "#be185d", dash: "6 4", label: "点線の枠＝今回だけの項目" },
              { color: "#8a94a6", label: "構造・包含（登録済みの関係）" },
            ]}
          />
        </div>
        <aside className="spot-panel story-panel" aria-label="質問に至った流れ">
          <strong className="spot-panel-title">
            質問に至った流れ
            <small>ナレッジグラフ全体の中で、参照した既存知見から、まだ分からない点・質問の順にたどります（一時表示・新しい知見として登録しません）。取得した知見の一覧はKnowledge retrievedにあります。</small>
          </strong>
          <div className="story-controls" role="group" aria-label="流れの操作">
            <button type="button" aria-label="前へ" disabled={at === 0} onClick={() => go(at - 1)}>
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              className="story-play"
              onClick={() => {
                if (playing) setPlaying(false);
                else {
                  if (at >= last) setIndex(0);
                  setPlaying(true);
                }
              }}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? "一時停止" : at >= last ? "最初から再生" : "再生"}
            </button>
            <button type="button" aria-label="次へ" disabled={at >= last} onClick={() => go(at + 1)}>
              <ChevronRight size={15} />
            </button>
            <span>
              {at + 1} / {steps.length}
            </span>
          </div>
          <ol className="story-steps">
            {steps.map((item, position) => (
              <li
                key={item.id}
                className={position === at ? "current" : position < at ? "done" : ""}
              >
                <button
                  type="button"
                  aria-current={position === at ? "step" : undefined}
                  onClick={() => go(position)}
                >
                  <span>{position + 1}</span>
                  {item.title}
                </button>
                {position === at && (
                  <div className="story-body" aria-live="polite">
                    <p>{item.text}</p>
                    {item.evidence.length > 0 && (
                      <ul>
                        {item.evidence.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <OpenGraph onOpenGraph={onOpenGraph} />
        </aside>
      </div>
    </div>
  );
}

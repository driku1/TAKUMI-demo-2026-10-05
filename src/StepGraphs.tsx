import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import type { Knowledge, Scenario } from "./data";
import type { retrieveKnowledge } from "./process-model";
import OntologyGraph, { LineSample, stepLineStyles } from "./OntologyGraph";
import {
  expectedKnowledgeProjection,
  questionPlanProjection,
  retrievalProjection,
  type ExpertCandidate,
  type PlannedQuestion,
} from "./ontology";

/*
 * Ontology views for the consultation steps. Each one draws part of the
 * approved ontology with the step's temporary items on top; none of them
 * adds anything to the Knowledge Graph or to the saved knowledge.
 */

type Retrieval = ReturnType<typeof retrieveKnowledge>;
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
            右側の知見は検索順位の順で、カードの「一致」は一致した検索語です。カードを選ぶと本文を表示します。
            {projection.themeTerms.length > 0 &&
              `工程領域全体の語（${projection.themeTerms.join("・")}）は線にせず、カードの「一致」にだけ表示しています。`}
          </p>
          <OpenGraph onOpenGraph={onOpenGraph} />
        </>
      }
    />
  );
}

/** Expert Matching: the note an interview with one candidate is expected to add. */
export function ExpectedKnowledgeOntology({
  knowledge,
  scenario,
  candidate,
  onArticle,
  onOpenGraph,
}: Common & { candidate: ExpertCandidate }) {
  const projection = useMemo(
    () => expectedKnowledgeProjection({ knowledge, scenario, candidate }),
    [knowledge, scenario, candidate],
  );
  return (
    <OntologyGraph
      key={projection.key}
      variant="inline"
      knowledge={knowledge}
      scenario={scenario}
      projection={projection}
      onArticle={onArticle}
      aside={
        <>
          <strong>
            想定される接続 {projection.connections.length}件{" "}
            <small>（インタビュー前の想定・未登録・保存しません）</small>
          </strong>
          <StepLegend
            items={[
              { ...stepLineStyles.expected, label: "想定される関係（一時表示）" },
              { color: "#3976f6", label: "所属・執筆（登録済みの関係）" },
            ]}
          />
          <ul>
            {projection.connections.map((item) => (
              <li key={`${item.label}-${item.target}`}>
                <i style={{ background: stepLineStyles.expected.color }} />
                <span>
                  <b>{item.label}</b>
                  {item.typeLabel}：{item.target}
                </span>
              </li>
            ))}
          </ul>
          <p className="onto-step-note">
            想定の根拠：{projection.basis.join(" · ")}。
            専門領域タグ・担当業務の説明・検索で見つかった本人の知見から作った想定で、回答の内容を予測するものではありません。インタビュー後、登録PRをApprove・Mergeした内容だけがナレッジグラフに入ります。
          </p>
          <OpenGraph onOpenGraph={onOpenGraph} />
        </>
      }
    />
  );
}

/** Question Plan: from which knowledge, what is still unknown, which question. */
export function QuestionPlanOntology({
  knowledge,
  scenario,
  retrieval,
  questions,
  onArticle,
  onOpenGraph,
}: Common & { retrieval: Retrieval; questions: PlannedQuestion[] }) {
  const ids = questions.map((item) => item.id).join(",");
  const projection = useMemo(
    () => questionPlanProjection({ knowledge, scenario, retrieval, questions }),
    // Questions appear one by one; the list is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [knowledge, scenario, retrieval, ids],
  );
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
            既存知見 → 確認したい点 → 生成した質問{" "}
            <small>（一時表示・新しい知見として登録しません）</small>
          </strong>
          <StepLegend
            items={[
              { ...stepLineStyles.plan, label: "質問計画のつながり（一時表示）" },
              { color: "#be185d", dash: "6 4", label: "点線の枠＝今回だけの項目（保存しない）" },
            ]}
          />
          <ol className="plan-rows">
            {projection.rows.map((row) => (
              <li key={row.question.id}>
                <b>
                  {row.question.id} · {row.question.text}
                </b>
                <dl>
                  {row.notes.map((note) => (
                    <div key={note.id}>
                      <dt>既存知見</dt>
                      <dd>
                        {note.id}「{note.title}」（検索{note.rank}位）：{note.summary}
                      </dd>
                    </div>
                  ))}
                  {row.answer && (
                    <div>
                      <dt>直前の回答</dt>
                      <dd>
                        {row.answer.label}：{row.answer.text}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>確認したい点</dt>
                    <dd>
                      {row.unknown}
                      {row.topics.length > 0 && `（観点：${row.topics.join("・")}）`}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
          <OpenGraph onOpenGraph={onOpenGraph} />
        </>
      }
    />
  );
}

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, FileText, Maximize2, Minus, Plus, X } from "lucide-react";
import type { Knowledge, Scenario } from "./data";
import type { KnowledgeUsage } from "./knowledge-cycle";
import {
  EDGE_FONT,
  NODE_FONT,
  boundsOf,
  countSummary,
  defaultStage,
  edgeGeometry,
  egoLayout,
  fitText,
  labelPriority,
  wrapText,
  neighbours,
  placeEdgeLabels,
  stageFrameNodes,
  stageLabels,
  zones,
  buildOntology,
  type EdgeKind,
  type OntologyEdge,
  type OntologyLayer,
  type OntologyNode,
  type OntologyStage,
} from "./ontology";
import "./ontology-graph.css";

type Variant = "page" | "card" | "inline";
type Camera = { scale: number; tx: number; ty: number };

const layerLabels: Record<OntologyLayer, string> = {
  org: "組織 / 部署 / チーム / 匠",
  process: "工程領域 / 対象部品",
  issue: "課題 / 技術・観点",
  document: "ドキュメント（既存ナレッジ）",
  registered: "登録知見（Merge済み）",
};
const stages: OntologyStage[] = ["before", "after", "focus", "usage"];
const heights: Record<Variant, number> = { page: 640, card: 300, inline: 430 };
const edgeColors: Record<EdgeKind, string> = {
  structure: "#8a94a6",
  organization: "#3976f6",
  reference: "#7500c0",
  tag: "#a3abba",
  approval: "#1f9d6b",
  usage: "#d97706",
};
const relationLegend: {
  kind: EdgeKind;
  name: string;
  note: string;
  dash?: string;
}[] = [
  { kind: "structure", name: "構造・包含", note: "配下 / 対象部品 / 確認観点 / 対象課題" },
  { kind: "organization", name: "所属・担当", note: "所属 / 担当 / 執筆" },
  { kind: "reference", name: "参照・出典", note: "参照（出典ドキュメント） / 発展元" },
  { kind: "approval", name: "承認", note: "承認（Approve review・模擬）" },
  {
    kind: "tag",
    name: "タグ一致・本文で言及",
    note: "語が一致しているだけの関係（因果関係ではない）",
    dash: "4 4",
  },
];

function LineSample({
  color,
  dash,
  width = 3,
  round = false,
}: {
  color: string;
  dash?: string;
  width?: number;
  round?: boolean;
}) {
  return (
    <svg className="onto-line-sample" width="34" height="12" aria-hidden="true">
      <line
        x1="2"
        y1="6"
        x2="32"
        y2="6"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap={round ? "round" : "butt"}
      />
    </svg>
  );
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function OntologyGraph({
  knowledge,
  overlay,
  scenario,
  variant = "page",
  initialStage,
  focusKnowledgeId,
  onArticle,
  onOpenGraph,
}: {
  knowledge: Knowledge[];
  /** Current answer's use of registered knowledge (session only, never saved). */
  overlay?: KnowledgeUsage | null;
  scenario: Scenario;
  variant?: Variant;
  initialStage?: OntologyStage;
  /** Inline variant: knowledge whose connections are explained. */
  focusKnowledgeId?: string;
  onArticle?: (item: Knowledge) => void;
  onOpenGraph?: () => void;
}) {
  const uid = useId().replace(/:/g, "");
  const interactive = variant !== "card";
  const availability = useMemo(
    () =>
      buildOntology({ knowledge, overlay, scenario, stage: "usage" })
        .availability,
    [knowledge, overlay, scenario],
  );
  const [stage, setStage] = useState<OntologyStage>(
    () => initialStage ?? defaultStage(availability),
  );
  const view = useMemo(
    () => buildOntology({ knowledge, overlay, scenario, stage }),
    [knowledge, overlay, scenario, stage],
  );
  // ④ draws the answer's temporary lines on top of the approved graph.
  const full = useMemo(
    () => ({
      nodes: view.nodes,
      edges:
        view.stage === "usage" ? [...view.edges, ...view.overlayEdges] : view.edges,
    }),
    [view],
  );
  const focusNodeId =
    (focusKnowledgeId &&
      view.nodes.find(
        (item) =>
          item.kind === "knowledge" && item.knowledgeId === focusKnowledgeId,
      )?.id) ||
    view.focusNodeId;
  const [selected, setSelected] = useState<string | null>(focusNodeId ?? null);
  const [layers, setLayers] = useState<Record<OntologyLayer, boolean>>({
    org: true,
    process: true,
    issue: true,
    document: true,
    registered: true,
  });
  const [largeText, setLargeText] = useState(false);
  const [allLabels, setAllLabels] = useState(false);
  const [camera, setCamera] = useState<Camera>({ scale: 0.6, tx: 0, ty: 0 });
  const [size, setSize] = useState({ w: 0, h: heights[variant] });
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  // Theme or saved data changed: go back to the most advanced available stage.
  useEffect(() => {
    if (initialStage) return;
    setStage(defaultStage(availability));
  }, [scenario.id, availability, initialStage]);
  // On narrow screens the detail panel would cover the canvas, so it opens on tap only.
  const autoSelect = variant !== "page" || size.w === 0 || size.w >= 760;
  useEffect(() => {
    setSelected(autoSelect ? (focusNodeId ?? null) : null);
  }, [view.stage, scenario.id, focusNodeId, autoSelect]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const update = () =>
      setSize({ w: element.clientWidth, h: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const frameKey = `${scenario.id}:${view.stage}:${focusNodeId}:${size.w}x${size.h}:${view.nodes.length}`;
  const fitTo = (frame: OntologyNode[], reserveDetail = false) => {
    if (!size.w) return;
    const box = boundsOf(frame, variant === "card" ? 16 : 34);
    // Keep the framed nodes clear of the detail panel that opens on the right.
    const width = reserveDetail && size.w > 760 ? size.w - 350 : size.w;
    const scale = clamp(
      Math.min(width / box.w, size.h / box.h),
      0.28,
      variant === "page" ? 1.15 : 1.05,
    );
    setCamera({
      scale,
      tx: (width - box.w * scale) / 2 - box.x * scale,
      ty: (size.h - box.h * scale) / 2 - box.y * scale,
    });
  };
  const frameNodes = () =>
    variant === "inline" && focusNodeId
      ? egoLayout(full, focusNodeId, view.usedNodeIds).nodes
      : stageFrameNodes(view, scenario);
  useEffect(() => {
    fitTo(frameNodes(), variant === "page" && Boolean(focusNodeId) && autoSelect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !interactive) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setCamera((current) => {
        const scale = clamp(
          current.scale * (event.deltaY < 0 ? 1.1 : 0.9),
          0.28,
          2.4,
        );
        const ratio = scale / current.scale;
        return {
          scale,
          tx: px - (px - current.tx) * ratio,
          ty: py - (py - current.ty) * ratio,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [interactive]);

  const zoomBy = (factor: number) =>
    setCamera((current) => {
      const scale = clamp(current.scale * factor, 0.28, 2.4);
      const ratio = scale / current.scale;
      const cx = size.w / 2;
      const cy = size.h / 2;
      return {
        scale,
        tx: cx - (cx - current.tx) * ratio,
        ty: cy - (cy - current.ty) * ratio,
      };
    });

  // The inline view re-arranges the same nodes and relations around the note.
  const drawn =
    variant === "inline" && focusNodeId
      ? egoLayout(full, focusNodeId, view.usedNodeIds)
      : full;
  const visibleNodes = drawn.nodes.filter((item) => layers[item.layer]);
  const visibleIds = new Set(visibleNodes.map((item) => item.id));
  const visibleEdges = drawn.edges.filter(
    (item) => visibleIds.has(item.source) && visibleIds.has(item.target),
  );
  const nodeById = new Map(drawn.nodes.map((item) => [item.id, item]));
  const selectedNode = selected ? nodeById.get(selected) : undefined;
  const newNodes = new Set(view.newNodeIds);
  const newEdges = new Set(view.newEdgeIds);
  const usedNodes = new Set(view.usedNodeIds);
  const usedEdges = new Set(view.usedEdgeIds);

  // Reference behaviour: the selected node and its relations stay lit, the
  // rest is dimmed. Stage emphasis (NEW / USED) stays lit as well.
  const selectedNeighbours = selectedNode
    ? neighbours(full, selectedNode.id)
    : new Set<string>();
  const activeEdges = new Set(
    visibleEdges
      .filter(
        (item) =>
          usedEdges.has(item.id) ||
          (view.stage !== "before" && newEdges.has(item.id)) ||
          (selectedNode &&
            (item.source === selectedNode.id || item.target === selectedNode.id)),
      )
      .map((item) => item.id),
  );
  const dimming = Boolean(selectedNode) || view.stage === "usage";
  const litNodes = new Set<string>([
    ...selectedNeighbours,
    ...usedNodes,
    ...(view.stage === "usage" ? [] : newNodes),
  ]);
  if (dimming) {
    for (const item of visibleEdges) {
      if (activeEdges.has(item.id)) {
        litNodes.add(item.source);
        litNodes.add(item.target);
      }
    }
  }
  const caseCluster = scenario.followUp?.baseScenarioId ?? scenario.id;
  const inCase = (item: OntologyNode) =>
    item.cluster === caseCluster || item.layer === "org";
  const edgeFont = EDGE_FONT * (largeText ? 1.2 : 1);
  const stagePriority = labelPriority(
    {
      usedEdgeIds: view.usedEdgeIds,
      newEdgeIds: view.stage === "before" ? [] : view.newEdgeIds,
    },
    activeEdges,
  );
  const priority = (item: OntologyEdge) => stagePriority(item);
  const labelCandidates = visibleEdges
    .filter((item) => {
      if (variant === "card") return activeEdges.has(item.id);
      if (allLabels || activeEdges.has(item.id)) return true;
      if (dimming || item.peripheral) return false;
      const a = nodeById.get(item.source)!;
      const b = nodeById.get(item.target)!;
      return inCase(a) && inCase(b);
    });
  // Placement only depends on what is drawn, not on the camera, so panning
  // and zooming reuse it.
  const labelKey = [
    scenario.id,
    view.stage,
    variant,
    edgeFont,
    visibleNodes.map((item) => item.id).join(","),
    labelCandidates.map((item) => `${item.id}:${priority(item)}`).join(","),
  ].join("|");
  const labels = useMemo(
    () => placeEdgeLabels(visibleNodes, labelCandidates, edgeFont, priority),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labelKey],
  );
  const counts = countSummary(view);
  const scale = largeText ? 1.2 : 1;
  const nodeCopy = stageLabels[view.stage];

  const chooseStage = (next: OntologyStage) => {
    if (!view.availability[next]) return;
    setStage(next);
  };
  const toggle = (id: string) =>
    setSelected((current) => (current === id ? null : id));
  const knowledgeOf = (item?: OntologyNode) =>
    item?.knowledgeId
      ? knowledge.find((entry) => entry.id === item.knowledgeId)
      : undefined;

  const relations = selectedNode
    ? full.edges
        .filter(
          (item) =>
            item.source === selectedNode.id || item.target === selectedNode.id,
        )
        .map((item) => {
          const other = nodeById.get(
            item.source === selectedNode.id ? item.target : item.source,
          )!;
          return { edge: item, other, outgoing: item.source === selectedNode.id };
        })
    : [];

  const markers = (Object.keys(edgeColors) as EdgeKind[]).map((kind) => (
    <marker
      key={kind}
      id={`${uid}-arrow-${kind}`}
      viewBox="0 0 10 10"
      refX="8.5"
      refY="5"
      markerWidth="5"
      markerHeight="5"
      orient="auto"
    >
      <path d="M0,0 L10,5 L0,10 z" fill={edgeColors[kind]} />
    </marker>
  ));

  const focusConnections =
    variant === "inline" && focusNodeId
      ? full.edges
          .filter(
            (item) => item.source === focusNodeId || item.target === focusNodeId,
          )
          .map((item) => ({
            edge: item,
            other: nodeById.get(
              item.source === focusNodeId ? item.target : item.source,
            )!,
          }))
      : [];

  return (
    <div className={`onto onto-${variant} ${largeText ? "large-text" : ""}`}>
      {variant === "page" && (
        <div className="onto-stage-bar">
          <div className="onto-stage-copy" aria-live="polite">
            <strong>{nodeCopy.title}</strong>
            <span>
              {view.stage === "before" && !view.availability.after
                ? "このテーマには承認・Merge済みの知見がまだありません。相談からApprove reviewとMergeを行うと②〜④を表示できます。"
                : nodeCopy.description}
            </span>
          </div>
          <div
            className="onto-stage-buttons"
            role="group"
            aria-label="グラフ表示の段階"
          >
            {stages.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view.stage === value}
                disabled={!view.availability[value]}
                title={
                  view.availability[value]
                    ? stageLabels[value].title
                    : value === "usage"
                      ? "第2サイクルの関連相談で回答すると表示できます"
                      : "第1サイクルで知見をMergeすると表示できます"
                }
                onClick={() => chooseStage(value)}
              >
                {stageLabels[value].button}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={variant === "page" ? "onto-main" : "onto-main-plain"}>
      {variant === "page" && (
        <aside className="onto-side" aria-label="表示レイヤーと凡例">
          <section role="group" aria-label="表示レイヤー">
            <h4>表示レイヤー</h4>
            {(Object.keys(layerLabels) as OntologyLayer[]).map((layer) => (
              <label key={layer} className="onto-check">
                <input
                  type="checkbox"
                  checked={layers[layer]}
                  onChange={(event) =>
                    setLayers((current) => ({
                      ...current,
                      [layer]: event.target.checked,
                    }))
                  }
                />
                {layerLabels[layer]}
              </label>
            ))}
          </section>
          <section aria-label="線の種類">
            <h4>関係（線の種類）</h4>
            {relationLegend.map((item) => (
              <div key={item.name} className="onto-legend-row">
                <LineSample color={edgeColors[item.kind]} dash={item.dash} />
                <div>
                  <b>{item.name}</b>
                  <small>{item.note}</small>
                </div>
              </div>
            ))}
          </section>
          <section aria-label="強調表示">
            <h4>強調</h4>
            <div className="onto-legend-row">
              <LineSample color="#a100ff" width={4} />
              <div>
                <b>
                  <span className="legend-badge new">NEW</span> 追加された点・線
                </b>
                <small>今回Mergeした知見と、自動でつながった関係（②③）</small>
              </div>
            </div>
            <div className="onto-legend-row">
              <LineSample color="#d97706" width={4} />
              <div>
                <b>
                  <span className="legend-badge used">USED</span> 回答で使った知見
                </b>
                <small>表示中の回答が使った登録知見と、その関係（④）</small>
              </div>
            </div>
            <div className="onto-legend-row">
              <LineSample color="#d97706" width={4} dash="1 6" round />
              <div>
                <b>回答で使用（一時表示）</b>
                <small>回答が知見を当てた課題・観点。保存されません（④）</small>
              </div>
            </div>
          </section>
          <section>
            <label className="onto-check">
              <input
                type="checkbox"
                checked={allLabels}
                onChange={(event) => setAllLabels(event.target.checked)}
              />
              すべての関係名を表示
            </label>
            <p className="onto-side-note">
              実線＝登録された関係、点線＝語の一致（因果関係ではありません）。ホイールで拡大縮小、背景ドラッグで移動、ノード選択で関係を強調します。
            </p>
          </section>
        </aside>
      )}
      <div className={`onto-body ${variant === "inline" ? "with-list" : ""}`}>
        <div
          ref={canvasRef}
          className={`onto-canvas ${variant === "page" && selectedNode ? "has-detail" : ""}`}
          style={{ height: heights[variant] }}
        >
          {variant !== "card" && (
            <div className="onto-floating" aria-hidden="true">
              <b>{nodeCopy.button}</b>
              <span>
                {counts.nodes} NODES · {counts.links} LINKS
              </span>
              {counts.newNodes + counts.newLinks > 0 && (
                <em className="new">
                  NEW +{counts.newNodes} / +{counts.newLinks} links
                </em>
              )}
              {counts.usedLinks > 0 && (
                <em className="used">
                  USED 知見{view.usedNodeIds.filter((id) => id.startsWith("knowledge")).length} · 関係{counts.usedLinks}（保存しない）
                </em>
              )}
            </div>
          )}
          <svg
            ref={svgRef}
            width={size.w || "100%"}
            height={size.h}
            role="group"
            aria-label={`${scenario.label}の製造ナレッジ・オントロジー。${nodeCopy.title}。${counts.nodes}ノード、${counts.links}リンク`}
            onPointerDown={(event) => {
              if (!interactive || (event.target as Element).closest(".onto-node"))
                return;
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                tx: camera.tx,
                ty: camera.ty,
                moved: false,
              };
              (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const current = drag.current;
              if (!current) return;
              const dx = event.clientX - current.x;
              const dy = event.clientY - current.y;
              if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
              setCamera((value) => ({
                ...value,
                tx: current.tx + dx,
                ty: current.ty + dy,
              }));
            }}
            onPointerUp={(event) => {
              const current = drag.current;
              drag.current = null;
              if (
                current &&
                !current.moved &&
                !(event.target as Element).closest(".onto-node")
              ) {
                setSelected(null);
              }
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <defs>
              <pattern
                id={`${uid}-dots`}
                width="28"
                height="28"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1" fill="#e6e2ee" />
              </pattern>
              {markers}
            </defs>
            <rect width="100%" height="100%" fill={`url(#${uid}-dots)`} />
            <g
              transform={`translate(${camera.tx.toFixed(1)} ${camera.ty.toFixed(1)}) scale(${camera.scale.toFixed(4)})`}
            >
              {variant !== "inline" && zones.map((zone) => (
                <g key={zone.id} className={`onto-zone zone-${zone.id}`}>
                  <rect
                    x={zone.x}
                    y={zone.y}
                    width={zone.width}
                    height={zone.height}
                    rx="22"
                  />
                  <text x={zone.x + 22} y={zone.y + 32} className="zone-title">
                    {zone.title}
                  </text>
                  <text x={zone.x + 22} y={zone.y + 50} className="zone-sub">
                    {zone.sub}
                  </text>
                </g>
              ))}
              {variant !== "inline" && view.clusters.map((cluster) => (
                <g
                  key={cluster.id}
                  className={`onto-cluster ${cluster.id === caseCluster ? "current" : ""}`}
                >
                  <rect
                    x={cluster.x}
                    y={cluster.y}
                    width={cluster.width}
                    height={cluster.height}
                    rx="16"
                  />
                  <text x={cluster.x + 14} y={cluster.y + 20}>
                    {cluster.title}
                    {cluster.id === caseCluster ? "（表示中のテーマ）" : ""}
                  </text>
                </g>
              ))}
              {visibleEdges.map((item) => {
                const a = nodeById.get(item.source)!;
                const b = nodeById.get(item.target)!;
                const geometry = edgeGeometry(a, b);
                const lit = activeEdges.has(item.id);
                const className = [
                  item.id.startsWith("overlay:") ? "onto-overlay" : "onto-edge",
                  `kind-${item.kind}`,
                  item.peripheral ? "peripheral" : "",
                  lit ? "active" : dimming ? "dim" : "",
                  view.stage !== "before" && newEdges.has(item.id) ? "is-new" : "",
                  usedEdges.has(item.id) ? "is-used" : "",
                ].join(" ");
                return (
                  <path
                    key={item.id}
                    d={geometry.path}
                    className={className}
                    stroke={edgeColors[item.kind]}
                    markerEnd={`url(#${uid}-arrow-${item.kind})`}
                  >
                    <title>{`${a.label} → ${b.label}：${item.label}`}</title>
                  </path>
                );
              })}
              {visibleNodes.map((item) => {
                const isNew = view.stage !== "before" && newNodes.has(item.id);
                const isUsed = usedNodes.has(item.id) && item.kind === "knowledge";
                const isTarget = usedNodes.has(item.id) && item.kind !== "knowledge";
                const dim = dimming && !litNodes.has(item.id);
                const titleFont = NODE_FONT.title * scale;
                const subFont = NODE_FONT.sub * scale;
                const typeFont = NODE_FONT.type * scale;
                const lines = item.sub ? 2 : 1;
                const titleY = lines === 2 ? 4 : 8;
                return (
                  <g
                    key={item.id}
                    className={[
                      "onto-node",
                      `kind-${item.kind}`,
                      selected === item.id ? "selected" : "",
                      dim ? "dim" : "",
                      isNew ? "is-new" : "",
                      isUsed ? "is-used" : "",
                      isTarget ? "is-used-target" : "",
                    ].join(" ")}
                    transform={`translate(${item.x} ${item.y})`}
                    role={interactive ? "button" : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    aria-pressed={interactive ? selected === item.id : undefined}
                    aria-label={interactive ? `${item.typeLabel}：${item.label}` : undefined}
                    onClick={() => interactive && toggle(item.id)}
                    onKeyDown={(event) => {
                      if (!interactive) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggle(item.id);
                      }
                    }}
                  >
                    <title>{`${item.typeLabel}：${item.label}`}</title>
                    <rect
                      className="outer"
                      x={-item.w / 2}
                      y={-item.h / 2}
                      width={item.w}
                      height={item.h}
                      rx={
                        item.kind === "topic"
                          ? item.h / 2
                          : ["document", "knowledge"].includes(item.kind)
                            ? 11
                            : 5
                      }
                    />
                    <text
                      className="node-type"
                      x={-item.w / 2 + 9}
                      y={-item.h / 2 + 4 + typeFont}
                      style={{ fontSize: typeFont }}
                    >
                      {fitText(item.typeLabel, item.w - 18, typeFont)}
                    </text>
                    {item.kind === "knowledge" ? (
                      wrapText(item.label, item.w - 16, titleFont).map((line, index, all) => (
                        <text
                          key={index}
                          className="node-title"
                          y={(all.length === 1 ? 6 : -2) + index * (titleFont + 3)}
                          style={{ fontSize: titleFont }}
                        >
                          {line}
                        </text>
                      ))
                    ) : (
                      <text
                        className="node-title"
                        y={titleY}
                        style={{ fontSize: titleFont }}
                      >
                        {fitText(item.label, item.w - 14, titleFont)}
                      </text>
                    )}
                    {item.sub && (
                      <text
                        className="node-sub"
                        y={
                          item.kind === "knowledge"
                            ? item.h / 2 - 9
                            : titleY + subFont + 3
                        }
                        style={{ fontSize: subFont }}
                      >
                        {fitText(item.sub, item.w - 14, subFont)}
                      </text>
                    )}
                    {(isNew || isUsed) && (
                      <g
                        className={`node-badge ${isUsed ? "used" : "new"}`}
                        transform={`translate(${item.w / 2 - 6} ${-item.h / 2 - 9})`}
                      >
                        <rect x={isUsed ? -60 : -34} y={-9} width={isUsed ? 66 : 40} height={18} rx={9} />
                        <text x={isUsed ? -27 : -14} y={4}>
                          {isUsed ? "USED 今回使用" : "NEW"}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              {labels.map((label) => {
                const item = full.edges.find((entry) => entry.id === label.edgeId)!;
                return (
                  <g
                    key={label.edgeId}
                    className={`onto-edge-label kind-${item.kind} ${usedEdges.has(item.id) ? "is-used" : view.stage !== "before" && newEdges.has(item.id) ? "is-new" : ""}`}
                  >
                    <rect
                      x={label.x}
                      y={label.y}
                      width={label.w}
                      height={label.h}
                      rx={label.h / 2}
                    />
                    <text
                      x={label.x + label.w / 2}
                      y={label.y + label.h / 2 + edgeFont * 0.36}
                      style={{ fontSize: edgeFont }}
                    >
                      {label.text}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
          {interactive && (
            <div className="onto-zoom">
              <button type="button" aria-label="拡大" title="拡大" onClick={() => zoomBy(1.18)}>
                <Plus size={15} />
              </button>
              <button type="button" aria-label="縮小" title="縮小" onClick={() => zoomBy(0.84)}>
                <Minus size={15} />
              </button>
              <button
                type="button"
                aria-label="文字サイズを切り替え"
                title="文字サイズ切替"
                aria-pressed={largeText}
                onClick={() => setLargeText((value) => !value)}
              >
                {largeText ? "A-" : "A+"}
              </button>
              <button
                type="button"
                aria-label="表示をリセット"
                title="表示をリセット"
                onClick={() => {
                  fitTo(frameNodes(), variant === "page" && Boolean(focusNodeId));
                  setSelected(focusNodeId ?? null);
                }}
              >
                <Maximize2 size={13} />
              </button>
              {variant === "page" && (
                <button
                  type="button"
                  aria-label="全体を表示"
                  title="全体を表示"
                  onClick={() => fitTo(view.nodes)}
                >
                  ⌂
                </button>
              )}
            </div>
          )}
          {variant === "page" && selectedNode && (
            <aside className="onto-detail" aria-label={`${selectedNode.label}の詳細`}>
              <button
                type="button"
                className="onto-detail-close"
                aria-label="詳細を閉じる"
                onClick={() => setSelected(null)}
              >
                <X size={14} />
              </button>
              <span className={`onto-chip kind-${selectedNode.kind}`}>
                {selectedNode.typeLabel}
              </span>
              {newNodes.has(selectedNode.id) && view.stage !== "before" && (
                <span className="onto-chip new">NEW</span>
              )}
              {usedNodes.has(selectedNode.id) && selectedNode.kind === "knowledge" && (
                <span className="onto-chip used">USED 今回使用</span>
              )}
              <h3>{selectedNode.label}</h3>
              <div className="onto-detail-box">
                <small>コンテキスト</small>
                <div className="onto-crumb">{selectedNode.path}</div>
              </div>
              {selectedNode.desc && (
                <div className="onto-detail-box">
                  <small>概要</small>
                  <p>{selectedNode.desc}</p>
                </div>
              )}
              {selectedNode.facts.length > 0 && (
                <div className="onto-detail-box">
                  <small>
                    登録内容
                  </small>
                  <dl>
                    {selectedNode.facts.map((fact, index) => (
                      <div key={`${fact.label}-${index}`}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              {selectedNode.id === "knowledge-1" && view.hiddenSources.length > 0 && (
                <p className="onto-note">
                  グラフ外の参照：{view.hiddenSources.join(", ")}
                </p>
              )}
              <div className="onto-detail-box">
                <small>関係（{relations.length}件）</small>
                <ul className="onto-relations">
                  {relations.map(({ edge, other, outgoing }) => (
                    <li key={edge.id}>
                      <button type="button" onClick={() => setSelected(other.id)}>
                        <i style={{ background: edgeColors[edge.kind] }} />
                        <span>
                          <b>{edge.label}</b>
                          {outgoing ? " → " : " ← "}
                          {other.label}
                        </span>
                        {usedEdges.has(edge.id) && <em className="used">USED</em>}
                        {!usedEdges.has(edge.id) &&
                          view.stage !== "before" &&
                          newEdges.has(edge.id) && <em className="new">NEW</em>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {knowledgeOf(selectedNode) && onArticle && (
                <button
                  type="button"
                  className="secondary-button onto-open-article"
                  onClick={() => onArticle(knowledgeOf(selectedNode)!)}
                >
                  <FileText size={14} />
                  本文を開く
                </button>
              )}
            </aside>
          )}
        </div>
        {variant === "inline" && (
          <aside className="onto-connections" aria-label="追加した知見の接続先">
            <strong>
              接続先 {focusConnections.length}件
              <small>（自動接続・手動選択なし）</small>
            </strong>
            <ul>
              {focusConnections.map(({ edge, other }) => (
                <li key={edge.id}>
                  <i style={{ background: edgeColors[edge.kind] }} />
                  <span>
                    <b>{edge.label}</b>
                    {other.label}
                  </span>
                </li>
              ))}
            </ul>
            {onOpenGraph && (
              <button type="button" className="text-button" onClick={onOpenGraph}>
                Knowledge Graphで段階表示を見る <ArrowRight size={14} />
              </button>
            )}
          </aside>
        )}
      </div>
      </div>
      {variant === "page" && (
        <>
          {view.usage && (
            <div className="onto-usage" aria-live="polite">
              <strong>今回の回答で使った登録知見（重ね表示・保存しません）</strong>
              <p>質問：{view.usage.question}</p>
              <p>
                使用した知見：
                {view.usage.usedKnowledge
                  .map((item) => `${item.title}（ID ${item.id}）`)
                  .join(" / ")}
              </p>
              <ul>
                {view.usage.checks
                  .filter((check) => check.usesKnowledge)
                  .map((check) => (
                    <li key={check.id}>
                      <b>{check.label}</b>
                      {check.sources
                        .filter((source) => source.kind === "knowledge")
                        .map((source) =>
                          source.kind === "knowledge" ? source.location : "",
                        )
                        .join(" / ")}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
      {variant === "card" && (
        <div className="onto-card-label">
          <span className="tiny-dot" />
          {nodeCopy.button}
          <span>
            {counts.nodes} NODES · {counts.links} LINKS
          </span>
        </div>
      )}
    </div>
  );
}


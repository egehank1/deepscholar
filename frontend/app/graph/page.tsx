"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback } from "react";
import { fetchKnowledgeGraph, type GraphNode, type GraphEdge, type KnowledgeGraphData, type NodeType } from "@/lib/api";

// react-force-graph-2d uses browser-only APIs (canvas, requestAnimationFrame).
// Dynamic import with ssr:false prevents hydration errors.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  ),
});

// ── Visual constants ──────────────────────────────────────────────────────────

const NODE_COLORS: Record<NodeType, string> = {
  paper:   "#6366f1", // indigo
  method:  "#a855f7", // purple
  dataset: "#10b981", // emerald
  task:    "#f59e0b", // amber
};

const EDGE_COLORS: Record<string, string> = {
  uses:         "#94a3b8",
  evaluates_on: "#f59e0b",
  addresses:    "#10b981",
  improves:     "#ef4444",
};

const NODE_SIZES: Record<NodeType, number> = {
  paper:   7,
  method:  5,
  dataset: 5,
  task:    5,
};

const TYPE_LABELS: Record<NodeType, string> = {
  paper:   "Paper",
  method:  "Method",
  dataset: "Dataset",
  task:    "Task",
};

const RELATION_LABELS: Record<string, string> = {
  uses:         "uses",
  evaluates_on: "evaluates on",
  addresses:    "addresses",
  improves:     "improves",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="h-8 w-8 animate-spin text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Filter types ──────────────────────────────────────────────────────────────

type FilterState = Record<NodeType, boolean>;
type EdgeFilter = Record<string, boolean>;

// ── Main component ────────────────────────────────────────────────────────────

export default function GraphPage() {
  const [rawData, setRawData] = useState<KnowledgeGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  // Use refs for hover/selected IDs so paintNode never needs to be recreated
  // on every mouseover (which would reset the force simulation).
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [search, setSearch] = useState("");
  const [nodeFilter, setNodeFilter] = useState<FilterState>({
    paper: true, method: true, dataset: true, task: true,
  });
  const [edgeFilter, setEdgeFilter] = useState<EdgeFilter>({
    uses: true, evaluates_on: true, addresses: true, improves: true,
  });

  const graphRef = useRef<any>(null);

  // Fetch graph data on mount
  useEffect(() => {
    fetchKnowledgeGraph()
      .then((data) => { setRawData(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  // Build filtered graph data.
  // The checkbox filters (node type + edge relation) hard-remove nodes/edges.
  // The text search is NOT applied here — it highlights in the canvas instead,
  // keeping the full graph structure visible so neighbors are shown in context.
  const graphData = useCallback(() => {
    if (!rawData) return { nodes: [], links: [] };

    const filteredNodes = rawData.nodes.filter((n) => nodeFilter[n.type]);
    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    const filteredLinks = rawData.edges.filter(
      (e) => edgeFilter[e.relation] && nodeIds.has(e.source) && nodeIds.has(e.target),
    );

    return {
      nodes: filteredNodes.map((n) => ({ ...n })),
      links: filteredLinks.map((e) => ({
        source: e.source,
        target: e.target,
        relation: e.relation,
      })),
    };
  }, [rawData, nodeFilter, edgeFilter]);

  const data = graphData();

  const counts = {
    paper:   rawData?.nodes.filter((n) => n.type === "paper").length ?? 0,
    method:  rawData?.nodes.filter((n) => n.type === "method").length ?? 0,
    dataset: rawData?.nodes.filter((n) => n.type === "dataset").length ?? 0,
    task:    rawData?.nodes.filter((n) => n.type === "task").length ?? 0,
  };

  const handleNodeClick = useCallback((node: any) => {
    selectedIdRef.current = node?.id ?? null;
    setSelected(node as GraphNode);
  }, []);

  const handleNodeHover = useCallback((node: any | null) => {
    hoveredIdRef.current = node?.id ?? null;
    if (typeof document !== "undefined") {
      document.body.style.cursor = node ? "pointer" : "default";
    }
    // No setState here — avoids re-render on every frame.
  }, []);

  const handleZoomToFit = () => {
    graphRef.current?.zoomToFit(400, 40);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-0 overflow-hidden">
      {/* ── Page header ── */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Knowledge Graph
          </h1>
          {rawData && (
            <p className="mt-0.5 text-xs text-slate-500">
              {rawData.nodes.length} nodes · {rawData.edges.length} edges
            </p>
          )}
        </div>

        {/* Search */}
        <div className="relative w-56">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Filter nodes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-slate-200"
          />
        </div>

        <button
          onClick={handleZoomToFit}
          className="hidden h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-slate-600 transition hover:bg-[var(--surface-subtle)] dark:text-slate-300 sm:inline-flex"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3.28 2.22a.75.75 0 00-1.06 1.06L5.44 6.5H2.75a.75.75 0 000 1.5h4.5A.75.75 0 008 7.25v-4.5a.75.75 0 00-1.5 0v2.69L3.28 2.22zM13.5 2.75a.75.75 0 010-1.5h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0V3.81l-3.22 3.22a.75.75 0 11-1.06-1.06l3.22-3.22h-2.69zM3.28 17.78l3.22-3.22H3.75a.75.75 0 010-1.5h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-2.69l-3.22 3.22a.75.75 0 11-1.06-1.06zM13.5 17.25v2.69l3.22-3.22a.75.75 0 111.06 1.06l-3.22 3.22h2.69a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75v-4.5a.75.75 0 011.5 0z" />
          </svg>
          Fit view
        </button>
      </div>

      {/* ── Main area ── */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-56 flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] p-4">
          {/* Node type filters */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Node types
            </p>
            <div className="space-y-1.5">
              {(Object.keys(nodeFilter) as NodeType[]).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2.5 text-xs">
                  <input
                    type="checkbox"
                    checked={nodeFilter[t]}
                    onChange={() => setNodeFilter((f) => ({ ...f, [t]: !f[t] }))}
                    className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
                  />
                  <span
                    className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ background: NODE_COLORS[t] }}
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    {TYPE_LABELS[t]}
                    <span className="ml-1 text-slate-400">({counts[t]})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Edge type filters */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Relationships
            </p>
            <div className="space-y-1.5">
              {Object.keys(edgeFilter).map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2.5 text-xs">
                  <input
                    type="checkbox"
                    checked={edgeFilter[r]}
                    onChange={() => setEdgeFilter((f) => ({ ...f, [r]: !f[r] }))}
                    className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
                  />
                  <span
                    className="inline-block h-0.5 w-5 flex-shrink-0"
                    style={{ background: EDGE_COLORS[r] }}
                  />
                  <span className="text-slate-700 dark:text-slate-300">
                    {RELATION_LABELS[r]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Stats */}
          {rawData && (
            <div className="mt-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Showing
              </p>
              <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                {data.nodes.length} / {rawData.nodes.length} nodes
              </p>
              <p className="text-xs text-slate-500">
                {data.links.length} / {rawData.edges.length} edges
              </p>
            </div>
          )}
        </aside>

        {/* Graph canvas */}
        <div className="relative min-h-0 flex-1 bg-[var(--background)]">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Spinner />
              <p className="text-sm text-slate-500">Building knowledge graph…</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center">
              <svg className="h-10 w-10 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Could not load knowledge graph
              </p>
              <p className="max-w-xs text-xs text-slate-500">{error}</p>
            </div>
          )}

          {!loading && !error && data.nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <svg className="h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2}
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                No graph data yet
              </p>
              <p className="max-w-xs text-xs text-slate-500">
                Upload papers first — the knowledge graph is built automatically from extracted metadata.
              </p>
            </div>
          )}

          {!loading && !error && data.nodes.length > 0 && (
            <GraphCanvas
              graphRef={graphRef}
              data={data}
              search={search}
              hoveredIdRef={hoveredIdRef}
              selectedIdRef={selectedIdRef}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
            />
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <DetailPanel node={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

// ── Graph canvas ──────────────────────────────────────────────────────────────

interface CanvasProps {
  graphRef: React.RefObject<any>;
  data: { nodes: any[]; links: any[] };
  search: string;
  hoveredIdRef: React.RefObject<string | null>;
  selectedIdRef: React.RefObject<string | null>;
  onNodeClick: (node: any) => void;
  onNodeHover: (node: any | null) => void;
}

function GraphCanvas({ graphRef, data, search, hoveredIdRef, selectedIdRef, onNodeClick, onNodeHover }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Adjacency map: nodeId → Set<neighborId> (bidirectional).
  const neighborsRef = useRef<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    const map = new Map<string, Set<string>>();
    for (const link of data.links) {
      const src: string = typeof link.source === "object" ? link.source.id : link.source;
      const tgt: string = typeof link.target === "object" ? link.target.id : link.target;
      if (!map.has(src)) map.set(src, new Set());
      if (!map.has(tgt)) map.set(tgt, new Set());
      map.get(src)!.add(tgt);
      map.get(tgt)!.add(src);
    }
    neighborsRef.current = map;
  }, [data]);

  // Search highlight set: null = no search active.
  // Contains matching nodes AND all their direct neighbors.
  const searchHighlightRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      searchHighlightRef.current = null;
      return;
    }
    const highlighted = new Set<string>();
    for (const node of data.nodes) {
      if (node.label.toLowerCase().includes(q)) {
        highlighted.add(node.id);
        neighborsRef.current.get(node.id)?.forEach((nid) => highlighted.add(nid));
      }
    }
    searchHighlightRef.current = highlighted;
  }, [data, search]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // All three callbacks read only from refs — created once, never recreated,
  // so ForceGraph2D never sees a prop change that would reset the simulation.
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    const color = NODE_COLORS[node.type as NodeType] ?? "#94a3b8";
    const baseR = NODE_SIZES[node.type as NodeType] ?? 5;

    const focusId = hoveredIdRef.current ?? selectedIdRef.current;
    const isHovered   = node.id === hoveredIdRef.current;
    const isSelected  = node.id === selectedIdRef.current;
    const isNeighbor  = focusId ? (neighborsRef.current.get(focusId)?.has(node.id) ?? false) : false;

    // Hover/selection takes priority; fall back to search highlight set.
    const searchSet = searchHighlightRef.current;
    const inSearchSet = searchSet ? searchSet.has(node.id) : true;

    const isFocused = isHovered || isSelected || isNeighbor || (focusId === null && inSearchSet);
    const isDimmed  = focusId !== null
      ? !isFocused                          // hover/select mode
      : searchSet !== null && !inSearchSet; // search mode

    const r = isHovered || isSelected ? baseR * 1.5 : isNeighbor ? baseR * 1.15 : baseR;

    // Glow ring for hovered / selected
    if (isHovered || isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
      ctx.fillStyle = `${color}33`;
      ctx.fill();
    }

    // Node circle — dimmed nodes are drawn at low opacity
    ctx.globalAlpha = isDimmed ? 0.12 : 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    if (isHovered || isSelected) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (isNeighbor) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Label — only show on focused nodes; always show selected
    if (!isDimmed || isSelected) {
      const fontSize = node.type === "paper" ? 4.5 : 3.8;
      ctx.font = `${isSelected || isHovered ? "bold " : ""}${fontSize}px Inter, sans-serif`;
      ctx.fillStyle = isSelected || isHovered ? "#1e293b" : isNeighbor ? "#334155" : "#94a3b8";
      ctx.globalAlpha = isDimmed ? 0 : 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const maxLen = 22;
      const label = node.label.length > maxLen ? node.label.slice(0, maxLen) + "…" : node.label;
      ctx.fillText(label, node.x, node.y + r + fontSize + 1);
      ctx.globalAlpha = 1;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const linkColor = useCallback((link: any) => {
    const src: string = typeof link.source === "object" ? link.source.id : link.source;
    const tgt: string = typeof link.target === "object" ? link.target.id : link.target;

    const focusId   = hoveredIdRef.current ?? selectedIdRef.current;
    const searchSet = searchHighlightRef.current;

    if (focusId) {
      // Hover/select mode: highlight only edges touching the focused node.
      if (src !== focusId && tgt !== focusId) return "#e2e8f015";
    } else if (searchSet) {
      // Search mode: highlight only edges where BOTH endpoints are in the set.
      if (!searchSet.has(src) || !searchSet.has(tgt)) return "#e2e8f015";
    }

    return EDGE_COLORS[link.relation] ?? "#94a3b8";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const linkWidth = useCallback((link: any) => {
    const src: string = typeof link.source === "object" ? link.source.id : link.source;
    const tgt: string = typeof link.target === "object" ? link.target.id : link.target;
    const focusId = hoveredIdRef.current ?? selectedIdRef.current;
    if (focusId && (src === focusId || tgt === focusId)) return 2;
    return link.relation === "improves" ? 2 : 1;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph2D
        ref={graphRef}
        graphData={data}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => "replace"}
        nodeLabel={(n: any) => `${TYPE_LABELS[n.type as NodeType]}: ${n.label}`}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.1}
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        backgroundColor="transparent"
        cooldownTicks={120}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  return (
    <aside className="flex w-72 flex-shrink-0 flex-col gap-4 overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="mt-0.5 inline-block h-3 w-3 flex-shrink-0 rounded-full"
            style={{ background: NODE_COLORS[node.type] }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {TYPE_LABELS[node.type]}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-0.5 text-slate-400 transition hover:bg-[var(--surface-subtle)] hover:text-slate-700"
          aria-label="Close panel"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.22 4.22a.75.75 0 011.06 0L8 6.94l2.72-2.72a.75.75 0 111.06 1.06L9.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 01-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      <h2 className="text-base font-semibold leading-snug text-slate-900 dark:text-slate-100">
        {node.label}
      </h2>

      {node.type === "paper" && (
        <>
          {node.meta.authors && node.meta.authors.length > 0 && (
            <Section title="Authors">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {node.meta.authors.slice(0, 5).join(", ")}
                {node.meta.authors.length > 5 && ` +${node.meta.authors.length - 5} more`}
              </p>
            </Section>
          )}

          {node.meta.abstract && (
            <Section title="Abstract">
              <p className="line-clamp-6 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {node.meta.abstract}
              </p>
            </Section>
          )}

          {node.meta.methodology && (
            <Section title="Methodology">
              <p className="line-clamp-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {node.meta.methodology}
              </p>
            </Section>
          )}
        </>
      )}

      <div className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2">
        <p className="text-[10px] text-slate-400">Node ID</p>
        <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">{node.id}</p>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </p>
      {children}
    </div>
  );
}

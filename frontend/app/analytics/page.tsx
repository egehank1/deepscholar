"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearEvaluationLogs,
  fetchEvaluationAnalytics,
  fetchEvaluationLogs,
  type EvaluationAnalytics,
  type EvaluationLog,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

function scoreColor(value: number | null): string {
  if (value === null) return "text-slate-400";
  if (value >= 0.8) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function barWidth(value: number | null): string {
  if (value === null) return "0%";
  return `${Math.round(value * 100)}%`;
}

function barBg(value: number | null): string {
  if (value === null) return "bg-slate-200";
  if (value >= 0.8) return "bg-emerald-500";
  if (value >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number | null;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className={`text-3xl font-bold tabular-nums ${scoreColor(value)}`}>
        {pct(value)}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barBg(value)}`}
          style={{ width: barWidth(value) }}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

function DailyTrendChart({
  data,
}: {
  data: EvaluationAnalytics["daily_trend"];
}) {
  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">No trend data yet.</p>
    );
  }

  const maxQueries = Math.max(...data.map((d) => d.queries), 1);
  const reversed = [...data].reverse();

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-end gap-2 px-1 pb-2 pt-4">
        {reversed.map((day) => (
          <div key={day.date} className="flex flex-col items-center gap-1">
            <span className={`text-xs font-semibold tabular-nums ${scoreColor(day.avg_score)}`}>
              {pct(day.avg_score)}
            </span>
            <div className="relative flex w-10 flex-col justify-end" style={{ height: "80px" }}>
              <div
                className={`w-full rounded-t transition-all duration-500 ${barBg(day.avg_score)}`}
                style={{
                  height: `${Math.max(4, Math.round((day.queries / maxQueries) * 72))}px`,
                  opacity: 0.85,
                }}
                title={`${day.queries} queries, avg score ${pct(day.avg_score)}`}
              />
            </div>
            <span className="w-10 text-center text-[10px] text-slate-400">
              {shortDate(day.date)}
            </span>
            <span className="text-[10px] text-slate-500">{day.queries}q</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-center text-xs text-slate-400">
        Bar height = query volume · Colour = avg overall score
      </p>
    </div>
  );
}

function LogRow({ log, index }: { log: EvaluationLog; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-shadow hover:shadow-sm"
    >
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-start gap-4 px-4 py-3 text-left"
      >
        <span className="mt-0.5 min-w-6 text-xs font-mono text-slate-400">
          #{index + 1}
        </span>
        <span className="flex-1 truncate text-sm text-slate-800 dark:text-slate-100">
          {log.question}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <ScorePill label="P" value={log.retrieval_precision} title="Retrieval Precision" />
          <ScorePill label="C" value={log.citation_correctness} title="Citation Correctness" />
          <ScorePill label="F" value={log.answer_faithfulness} title="Answer Faithfulness" />
          <span
            className={`min-w-14 rounded-full px-2 py-0.5 text-center text-xs font-bold ${
              log.overall_score !== null && log.overall_score >= 0.8
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : log.overall_score !== null && log.overall_score >= 0.5
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
            }`}
          >
            {pct(log.overall_score)}
          </span>
          <span className="text-xs text-slate-400">{formatDate(log.created_at)}</span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Answer</p>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap line-clamp-6">
              {log.answer}
            </p>
          </div>
          {log.citations.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Citations ({log.citations.length})
              </p>
              <ul className="space-y-1">
                {log.citations.slice(0, 3).map((c, i) => (
                  <li key={i} className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-[var(--accent)]">[{i + 1}] {c.source}</span>
                    {" — "}
                    <span className="line-clamp-1">{c.text}</span>
                  </li>
                ))}
                {log.citations.length > 3 && (
                  <li className="text-xs text-slate-400">
                    +{log.citations.length - 3} more citations
                  </li>
                )}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-4 pt-1">
            <MiniBar label="Retrieval Precision" value={log.retrieval_precision} />
            <MiniBar label="Citation Correctness" value={log.citation_correctness} />
            <MiniBar label="Answer Faithfulness" value={log.answer_faithfulness} />
          </div>
        </div>
      )}
    </div>
  );
}

function ScorePill({
  label,
  value,
  title,
}: {
  label: string;
  value: number | null;
  title: string;
}) {
  return (
    <span
      className={`hidden sm:inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs tabular-nums ${scoreColor(value)}`}
      title={title}
    >
      <span className="font-mono text-[10px] text-slate-400">{label}</span>
      {pct(value)}
    </span>
  );
}

function MiniBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-1 min-w-36">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <span className={`text-xs font-semibold tabular-nums ${scoreColor(value)}`}>
          {pct(value)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${barBg(value)}`}
          style={{ width: barWidth(value) }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<EvaluationAnalytics | null>(null);
  const [logs, setLogs] = useState<EvaluationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEvaluationAnalytics();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async (pageNum: number) => {
    setLogsLoading(true);
    try {
      const data = await fetchEvaluationLogs(PAGE_SIZE, pageNum * PAGE_SIZE);
      if (pageNum === 0) {
        setLogs(data.logs);
      } else {
        setLogs((prev) => [...prev, ...data.logs]);
      }
    } catch {
      // logs are secondary — don't surface error
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
    loadLogs(0);
  }, [loadAnalytics, loadLogs]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadLogs(nextPage);
  };

  const handleClear = async () => {
    if (!confirm("Delete all evaluation logs and analytics? This cannot be undone.")) return;
    setClearing(true);
    setError(null);
    try {
      await clearEvaluationLogs();
      setAnalytics(null);
      setLogs([]);
      setPage(0);
      await loadAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear analytics");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            RAG Quality Analytics
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Retrieval precision, citation correctness, and answer faithfulness — logged per query.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { loadAnalytics(); loadLogs(0); setPage(0); }}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-[var(--surface-subtle)] dark:text-slate-300"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.389zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
                clipRule="evenodd"
              />
            </svg>
            Refresh
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-[var(--surface)] px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                clipRule="evenodd"
              />
            </svg>
            {clearing ? "Clearing…" : "Clear all"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
            />
          ))}
        </div>
      ) : analytics ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              label="Retrieval Precision"
              value={analytics.avg_retrieval_precision}
              description="Avg fraction of retrieved chunks actually cited"
            />
            <MetricCard
              label="Citation Correctness"
              value={analytics.avg_citation_correctness}
              description="Avg fraction of citations grounded in retrieved text"
            />
            <MetricCard
              label="Answer Faithfulness"
              value={analytics.avg_answer_faithfulness}
              description="Avg fraction of factual sentences with citation markers"
            />
            <MetricCard
              label="Overall Score"
              value={analytics.avg_overall_score}
              description={`Mean across all three metrics · ${analytics.total_queries} queries logged`}
            />
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {analytics.total_queries}
              </span>{" "}
              total queries evaluated
            </span>
            {analytics.first_query_at && (
              <span>
                Since{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {formatDate(analytics.first_query_at)}
                </span>
              </span>
            )}
            {analytics.last_query_at && (
              <span>
                Last query{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {formatDate(analytics.last_query_at)}
                </span>
              </span>
            )}
          </div>

          {/* Daily trend */}
          {analytics.daily_trend.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
              <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Daily Trend (last 30 days)
              </h2>
              <DailyTrendChart data={analytics.daily_trend} />
            </div>
          )}
        </>
      ) : null}

      {/* Metric legend */}
      <div className="flex flex-wrap gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-600 dark:text-slate-300">Legend:</span>
        <span><span className="font-mono font-bold">P</span> = Retrieval Precision</span>
        <span><span className="font-mono font-bold">C</span> = Citation Correctness</span>
        <span><span className="font-mono font-bold">F</span> = Answer Faithfulness</span>
        <span className="text-emerald-600">■ ≥ 80% good</span>
        <span className="text-amber-600">■ ≥ 50% fair</span>
        <span className="text-red-600">■ &lt; 50% poor</span>
      </div>

      {/* Query log */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
          Query Log
        </h2>
        {logs.length === 0 && !logsLoading ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-16 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No queries logged yet. Ask a question in the{" "}
              <a href="/chat" className="text-[var(--accent)] underline underline-offset-2">
                chat
              </a>{" "}
              to start tracking quality.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log, i) => (
              <LogRow key={log.id} log={log} index={i} />
            ))}
            {logsLoading && (
              <div className="py-4 text-center text-sm text-slate-400">Loading…</div>
            )}
            {logs.length > 0 && logs.length % PAGE_SIZE === 0 && !logsLoading && (
              <button
                type="button"
                onClick={handleLoadMore}
                className="w-full rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-slate-500 transition hover:bg-[var(--surface-subtle)] dark:text-slate-400"
              >
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

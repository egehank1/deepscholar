"use client";

import { useState } from "react";
import type { PaperExtraction } from "@/lib/api";

// ── Icon atoms ────────────────────────────────────────────────────────────────

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
        expanded ? "rotate-180" : ""
      }`}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function MethodologyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  );
}

function DatasetsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function MetricsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

function LimitationsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function AbstractIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <line x1="21" y1="10" x2="3" y2="10" />
      <line x1="21" y1="6" x2="3" y2="6" />
      <line x1="21" y1="14" x2="3" y2="14" />
      <line x1="14" y1="18" x2="3" y2="18" />
    </svg>
  );
}

// ── Card config ───────────────────────────────────────────────────────────────

type CardAccent =
  | "violet"
  | "sky"
  | "emerald"
  | "amber";

const ACCENT_CLASSES: Record<CardAccent, { icon: string; badge: string; dot: string }> = {
  violet: {
    icon: "text-violet-500 dark:text-violet-400",
    badge: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    dot:   "bg-violet-400",
  },
  sky: {
    icon: "text-sky-500 dark:text-sky-400",
    badge: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    dot:   "bg-sky-400",
  },
  emerald: {
    icon: "text-emerald-500 dark:text-emerald-400",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    dot:   "bg-emerald-400",
  },
  amber: {
    icon: "text-amber-500 dark:text-amber-400",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    dot:   "bg-amber-400",
  },
};

// ── InsightCard ───────────────────────────────────────────────────────────────

interface InsightCardProps {
  icon: React.ReactNode;
  label: string;
  accent: CardAccent;
  count?: number;
  defaultOpen?: boolean;
  empty?: boolean;
  children: React.ReactNode;
}

function InsightCard({
  icon,
  label,
  accent,
  count,
  defaultOpen = false,
  empty = false,
  children,
}: InsightCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = ACCENT_CLASSES[accent];

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-subtle)]"
        aria-expanded={open}
      >
        <span className={colors.icon}>{icon}</span>
        <span className="flex-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-600 dark:text-slate-400">
          {label}
        </span>
        {count !== undefined && count > 0 && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${colors.badge}`}>
            {count}
          </span>
        )}
        {empty && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-slate-800">
            —
          </span>
        )}
        <span className="text-slate-400">
          <ChevronIcon expanded={open} />
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-subtle)]/50 px-3 pb-3 pt-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <p className="text-[11px] italic text-slate-400 dark:text-slate-500">
      {label} not reported in this paper.
    </p>
  );
}

function BulletList({ items, accent }: { items: string[]; accent: CardAccent }) {
  const { dot } = ACCENT_CLASSES[accent];
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ProseText({ text }: { text: string }) {
  return (
    <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
      {text}
    </p>
  );
}

// ── ExtractionPanel ───────────────────────────────────────────────────────────

interface ExtractionPanelProps {
  extraction: PaperExtraction;
}

export function ExtractionPanel({ extraction }: ExtractionPanelProps) {
  const hasTitle      = Boolean(extraction.title);
  const hasAuthors    = extraction.authors.length > 0;
  const hasAbstract   = Boolean(extraction.abstract);
  const hasMethod     = Boolean(extraction.methodology);
  const hasDatasets   = extraction.datasets.length > 0;
  const hasMetrics    = extraction.metrics.length > 0;
  const hasLimits     = Boolean(extraction.limitations);

  const anyData = hasTitle || hasAuthors || hasAbstract || hasMethod ||
                  hasDatasets || hasMetrics || hasLimits;

  if (!anyData) return null;

  return (
    <div className="space-y-2.5">
      {/* Section label */}
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-400 dark:text-slate-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden>
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
        </svg>
        Research Insights
      </p>

      {/* Title + Authors */}
      {(hasTitle || hasAuthors) && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 space-y-1">
          {hasTitle && (
            <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
              {extraction.title}
            </p>
          )}
          {hasAuthors && (
            <div className="flex flex-wrap gap-1">
              {extraction.authors.map((author, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                >
                  {author}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Abstract */}
      <InsightCard
        icon={<AbstractIcon />}
        label="Abstract"
        accent="violet"
        empty={!hasAbstract}
      >
        {hasAbstract ? (
          <ProseText text={extraction.abstract!} />
        ) : (
          <EmptyState label="Abstract" />
        )}
      </InsightCard>

      {/* Methodology */}
      <InsightCard
        icon={<MethodologyIcon />}
        label="Methodology"
        accent="violet"
        empty={!hasMethod}
      >
        {hasMethod ? (
          <ProseText text={extraction.methodology!} />
        ) : (
          <EmptyState label="Methodology" />
        )}
      </InsightCard>

      {/* Datasets */}
      <InsightCard
        icon={<DatasetsIcon />}
        label="Datasets"
        accent="sky"
        count={extraction.datasets.length}
        empty={!hasDatasets}
      >
        {hasDatasets ? (
          <BulletList items={extraction.datasets} accent="sky" />
        ) : (
          <EmptyState label="Datasets" />
        )}
      </InsightCard>

      {/* Metrics */}
      <InsightCard
        icon={<MetricsIcon />}
        label="Metrics"
        accent="emerald"
        count={extraction.metrics.length}
        empty={!hasMetrics}
      >
        {hasMetrics ? (
          <BulletList items={extraction.metrics} accent="emerald" />
        ) : (
          <EmptyState label="Metrics" />
        )}
      </InsightCard>

      {/* Limitations */}
      <InsightCard
        icon={<LimitationsIcon />}
        label="Limitations"
        accent="amber"
        empty={!hasLimits}
      >
        {hasLimits ? (
          <ProseText text={extraction.limitations!} />
        ) : (
          <EmptyState label="Limitations" />
        )}
      </InsightCard>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useResearchStore } from "@/store/useResearchStore";
import type { FileResult, PaperExtraction } from "@/lib/api";

// ── Icons ─────────────────────────────────────────────────────────────────────

function MethodologyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  );
}

function DatasetsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function MetricsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

function LimitationsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompareField {
  key: keyof Pick<PaperExtraction, "methodology" | "datasets" | "metrics" | "limitations">;
  label: string;
  icon: React.ReactNode;
  accent: {
    header: string;
    iconColor: string;
    badge: string;
    dot: string;
    border: string;
  };
  type: "prose" | "list";
}

const COMPARE_FIELDS: CompareField[] = [
  {
    key: "methodology",
    label: "Methodology",
    icon: <MethodologyIcon />,
    accent: {
      header: "bg-violet-50 dark:bg-violet-950/30",
      iconColor: "text-violet-500 dark:text-violet-400",
      badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300",
      dot: "bg-violet-400",
      border: "border-violet-200 dark:border-violet-800/50",
    },
    type: "prose",
  },
  {
    key: "datasets",
    label: "Datasets",
    icon: <DatasetsIcon />,
    accent: {
      header: "bg-sky-50 dark:bg-sky-950/30",
      iconColor: "text-sky-500 dark:text-sky-400",
      badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300",
      dot: "bg-sky-400",
      border: "border-sky-200 dark:border-sky-800/50",
    },
    type: "list",
  },
  {
    key: "metrics",
    label: "Metrics",
    icon: <MetricsIcon />,
    accent: {
      header: "bg-emerald-50 dark:bg-emerald-950/30",
      iconColor: "text-emerald-500 dark:text-emerald-400",
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
      dot: "bg-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800/50",
    },
    type: "list",
  },
  {
    key: "limitations",
    label: "Limitations",
    icon: <LimitationsIcon />,
    accent: {
      header: "bg-amber-50 dark:bg-amber-950/30",
      iconColor: "text-amber-500 dark:text-amber-400",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
      dot: "bg-amber-400",
      border: "border-amber-200 dark:border-amber-800/50",
    },
    type: "prose",
  },
];

// ── Paper selector ────────────────────────────────────────────────────────────

function shortenFilename(name: string, max = 28): string {
  const withoutExt = name.replace(/\.pdf$/i, "");
  if (withoutExt.length <= max) return withoutExt;
  return withoutExt.slice(0, max - 1) + "…";
}

interface PaperSelectorProps {
  allDocs: FileResult[];
  selected: string[];
  onToggle: (filename: string) => void;
}

function PaperSelector({ allDocs, selected, onToggle }: PaperSelectorProps) {
  const [open, setOpen] = useState(false);
  const available = allDocs.filter((d) => !selected.includes(d.filename));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={available.length === 0}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-300"
      >
        <PlusIcon />
        Add paper
        {available.length > 0 && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {available.length}
          </span>
        )}
      </button>

      {open && available.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-72 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl ring-1 ring-black/5 dark:ring-white/5">
            <div className="border-b border-[var(--border)] px-3 py-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Select a paper to add
              </p>
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
              {available.map((doc) => (
                <li key={doc.filename}>
                  <button
                    type="button"
                    onClick={() => { onToggle(doc.filename); setOpen(false); }}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-[var(--surface-subtle)]"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 dark:bg-slate-800">
                      <BookIcon />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {doc.extraction?.title ?? shortenFilename(doc.filename)}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {doc.filename} · {doc.pages}p
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ── Cell content ──────────────────────────────────────────────────────────────

interface CellProps {
  field: CompareField;
  extraction: PaperExtraction | undefined;
}

function ComparisonCell({ field, extraction }: CellProps) {
  const value = extraction?.[field.key];
  const isEmpty =
    field.type === "list"
      ? !value || (Array.isArray(value) && (value as string[]).length === 0)
      : !value;

  if (isEmpty) {
    return (
      <div className="flex h-full min-h-[80px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 dark:border-slate-700/50 dark:bg-slate-900/30">
        <p className="text-center text-[11px] italic text-slate-400 dark:text-slate-500">
          Not reported
        </p>
      </div>
    );
  }

  if (field.type === "list") {
    const items = value as string[];
    return (
      <div className="space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${field.accent.dot}`} aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${field.accent.badge}`}>
          {items.length} {items.length === 1 ? "item" : "items"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
      <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
        {value as string}
      </p>
    </div>
  );
}

// ── Paper column header ───────────────────────────────────────────────────────

interface PaperHeaderProps {
  doc: FileResult;
  index: number;
  onRemove: () => void;
}

const COLUMN_COLORS = [
  { bg: "bg-indigo-500", soft: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-200 dark:border-indigo-800/50" },
  { bg: "bg-rose-500",   soft: "bg-rose-50 dark:bg-rose-950/40",   text: "text-rose-600 dark:text-rose-400",   border: "border-rose-200 dark:border-rose-800/50" },
  { bg: "bg-teal-500",   soft: "bg-teal-50 dark:bg-teal-950/40",   text: "text-teal-600 dark:text-teal-400",   border: "border-teal-200 dark:border-teal-800/50" },
  { bg: "bg-fuchsia-500", soft: "bg-fuchsia-50 dark:bg-fuchsia-950/40", text: "text-fuchsia-600 dark:text-fuchsia-400", border: "border-fuchsia-200 dark:border-fuchsia-800/50" },
  { bg: "bg-orange-500", soft: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-600 dark:text-orange-400", border: "border-orange-200 dark:border-orange-800/50" },
];

function PaperColumnHeader({ doc, index, onRemove }: PaperHeaderProps) {
  const color = COLUMN_COLORS[index % COLUMN_COLORS.length];
  const title = doc.extraction?.title ?? doc.filename.replace(/\.pdf$/i, "");
  const authors = doc.extraction?.authors ?? [];

  return (
    <div className={`relative rounded-xl border ${color.border} ${color.soft} px-4 py-3`}>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${title}`}
        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-600 dark:hover:bg-slate-700/60 dark:hover:text-slate-300"
      >
        <XIcon />
      </button>

      <div className="flex items-start gap-2.5 pr-6">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color.bg} text-xs font-bold text-white shadow-sm`}>
          P{index + 1}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold leading-snug ${color.text}`}>
            {title}
          </p>
          {authors.length > 0 && (
            <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
              {authors.slice(0, 3).join(", ")}
              {authors.length > 3 && ` +${authors.length - 3} more`}
            </p>
          )}
          <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
            {doc.pages} pages · {doc.chunks_stored} chunks
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Empty / zero states ───────────────────────────────────────────────────────

function NoDocumentsState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-20 text-center dark:border-slate-700/50 dark:bg-slate-900/20">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm text-slate-400">
        <ChartIcon />
      </span>
      <div>
        <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
          No documents in your library
        </p>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
          Upload PDFs first, then return here to compare them side by side.
        </p>
      </div>
      <a
        href="/upload"
        className="mt-1 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
      >
        Go to Upload
      </a>
    </div>
  );
}

function NoPapersSelectedState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center dark:border-slate-700/50 dark:bg-slate-900/20">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm text-slate-400">
        <PlusIcon />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          No papers selected for comparison
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Use the &ldquo;Add paper&rdquo; button above to pick papers from your library.
        </p>
      </div>
    </div>
  );
}

// ── Comparison table ──────────────────────────────────────────────────────────

interface ComparisonTableProps {
  docs: FileResult[];
  onRemove: (filename: string) => void;
}

function ComparisonTable({ docs, onRemove }: ComparisonTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <table className="w-full border-collapse" style={{ minWidth: `${Math.max(640, 200 + docs.length * 280)}px` }}>
        {/* Column definitions */}
        <colgroup>
          <col style={{ width: "200px" }} />
          {docs.map((_, i) => (
            <col key={i} style={{ width: "280px" }} />
          ))}
        </colgroup>

        {/* Paper headers */}
        <thead>
          <tr>
            <th className="border-b border-r border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-4 text-left align-top">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                  Comparing {docs.length} paper{docs.length !== 1 ? "s" : ""}
                </span>
              </div>
            </th>
            {docs.map((doc, i) => (
              <th key={doc.filename} className="border-b border-r border-[var(--border)] px-4 py-4 text-left align-top last:border-r-0">
                <PaperColumnHeader doc={doc} index={i} onRemove={() => onRemove(doc.filename)} />
              </th>
            ))}
          </tr>
        </thead>

        {/* Field rows */}
        <tbody>
          {COMPARE_FIELDS.map((field, ri) => (
            <tr key={field.key} className={ri % 2 === 0 ? "" : "bg-slate-50/40 dark:bg-slate-900/20"}>
              {/* Row label */}
              <td className="border-b border-r border-[var(--border)] px-5 py-5 align-top last:border-b-0">
                <div className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${field.accent.header}`}>
                  <span className={field.accent.iconColor}>{field.icon}</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {field.label}
                  </span>
                </div>
              </td>

              {/* Paper cells */}
              {docs.map((doc) => (
                <td key={doc.filename} className="border-b border-r border-[var(--border)] px-4 py-4 align-top last:border-r-0">
                  <ComparisonCell field={field} extraction={doc.extraction} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function CoverageBadge({ docs }: { docs: FileResult[] }) {
  const totals = COMPARE_FIELDS.reduce(
    (acc, field) => {
      const filled = docs.filter((d) => {
        const v = d.extraction?.[field.key];
        return field.type === "list"
          ? Array.isArray(v) && (v as string[]).length > 0
          : Boolean(v);
      }).length;
      return { filled: acc.filled + filled, total: acc.total + docs.length };
    },
    { filled: 0, total: 0 }
  );
  const pct = totals.total === 0 ? 0 : Math.round((totals.filled / totals.total) * 100);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{pct}%</span> data coverage
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const uploadedDocuments = useResearchStore((s) => s.uploadedDocuments);
  const selectedFilenames = useResearchStore((s) => s.selectedDocumentsForComparison);
  const toggleSelection  = useResearchStore((s) => s.toggleDocumentSelectionForComparison);

  const selectedDocs = uploadedDocuments.filter((d) =>
    selectedFilenames.includes(d.filename)
  );

  const hasDocuments = uploadedDocuments.length > 0;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Compare Papers
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Side-by-side comparison of methodology, datasets, metrics, and limitations
          </p>
        </div>

        {hasDocuments && (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {selectedDocs.length >= 2 && <CoverageBadge docs={selectedDocs} />}
            <PaperSelector
              allDocs={uploadedDocuments}
              selected={selectedFilenames}
              onToggle={toggleSelection}
            />
          </div>
        )}
      </div>

      {/* Active paper chips */}
      {selectedDocs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
            In comparison:
          </span>
          {selectedDocs.map((doc, i) => {
            const color = COLUMN_COLORS[i % COLUMN_COLORS.length];
            const label = doc.extraction?.title ?? doc.filename.replace(/\.pdf$/i, "");
            return (
              <span
                key={doc.filename}
                className={`inline-flex items-center gap-1.5 rounded-full border ${color.border} ${color.soft} pl-2 pr-1 py-0.5 text-xs font-medium ${color.text}`}
              >
                <span className={`h-4 w-4 rounded-full ${color.bg} text-[10px] font-bold text-white flex items-center justify-center`}>
                  {i + 1}
                </span>
                <span className="max-w-[160px] truncate">{label}</span>
                <button
                  type="button"
                  onClick={() => toggleSelection(doc.filename)}
                  aria-label={`Remove ${label}`}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-current opacity-60 transition hover:opacity-100"
                >
                  <XIcon />
                </button>
              </span>
            );
          })}
          {selectedDocs.length > 1 && (
            <button
              type="button"
              onClick={() => selectedDocs.forEach((d) => toggleSelection(d.filename))}
              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:text-slate-500 dark:hover:text-slate-300"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Main content */}
      {!hasDocuments ? (
        <NoDocumentsState />
      ) : selectedDocs.length === 0 ? (
        <>
          <NoPapersSelectedState onAdd={() => {}} />

          {/* Quick-select from library */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Your library
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {uploadedDocuments.map((doc) => {
                const isSelected = selectedFilenames.includes(doc.filename);
                const title = doc.extraction?.title ?? doc.filename.replace(/\.pdf$/i, "");
                const authors = doc.extraction?.authors ?? [];
                return (
                  <button
                    key={doc.filename}
                    type="button"
                    onClick={() => toggleSelection(doc.filename)}
                    className={`group relative flex flex-col gap-2 rounded-xl border p-4 text-left transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-slate-300 hover:shadow-sm dark:hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-slate-500">
                        <BookIcon />
                      </span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-slate-300 dark:border-slate-600"
                      }`}>
                        {isSelected && <CheckIcon />}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {title}
                      </p>
                      {authors.length > 0 && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          {authors.slice(0, 2).join(", ")}
                          {authors.length > 2 && ` +${authors.length - 2}`}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {doc.pages > 0 && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {doc.pages}p
                        </span>
                      )}
                      {doc.chunks_stored > 0 && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {doc.chunks_stored} chunks
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : selectedDocs.length === 1 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Add at least one more paper to start the comparison.
            </span>
          </div>
          <ComparisonTable docs={selectedDocs} onRemove={toggleSelection} />
        </div>
      ) : (
        <ComparisonTable docs={selectedDocs} onRemove={toggleSelection} />
      )}
    </div>
  );
}

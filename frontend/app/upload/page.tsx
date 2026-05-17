"use client";

import { useCallback, useRef, useState } from "react";
import { uploadSinglePdf, type FileResult } from "@/lib/api";
import { useDocuments } from "@/context/DocumentsContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type FileStatus = "queued" | "uploading" | "processing" | "done" | "error";

interface ManagedFile {
  id: string;
  file: File;
  status: FileStatus;
  /** 0–100 during the HTTP upload phase */
  progress: number;
  result?: FileResult;
  error?: string;
}

// ── Icon atoms ────────────────────────────────────────────────────────────────

function SpinnerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function CheckIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PdfFileIcon() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500 dark:bg-red-950/50 dark:text-red-400">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    </div>
  );
}

function PageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function ChunksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, progress }: { status: FileStatus; progress: number }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

  switch (status) {
    case "queued":
      return (
        <span className={`${base} bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400`}>
          Queued
        </span>
      );
    case "uploading":
      return (
        <span className={`${base} bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300`}>
          <SpinnerIcon size={10} />
          {progress}%
        </span>
      );
    case "processing":
      return (
        <span className={`${base} bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300`}>
          <SpinnerIcon size={10} />
          Embedding
        </span>
      );
    case "done":
      return (
        <span className={`${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300`}>
          <CheckIcon />
          Indexed
        </span>
      );
    case "error":
      return (
        <span className={`${base} bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300`}>
          Failed
        </span>
      );
  }
}

// ── Managed file row ──────────────────────────────────────────────────────────

function ManagedFileRow({
  mf,
  onRemove,
}: {
  mf: ManagedFile;
  onRemove?: () => void;
}) {
  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition-colors">
      <div className="flex items-center gap-3">
        <PdfFileIcon />

        <div className="min-w-0 flex-1">
          {/* Name + badge row */}
          <div className="flex items-center justify-between gap-3">
            <span
              className="truncate text-sm font-medium text-slate-800 dark:text-slate-100"
              title={mf.file.name}
            >
              {mf.file.name}
            </span>
            <StatusBadge status={mf.status} progress={mf.progress} />
          </div>

          {/* Upload progress bar */}
          {(mf.status === "uploading" || mf.status === "processing") && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  mf.status === "processing"
                    ? "w-full animate-pulse bg-amber-400"
                    : "bg-blue-500"
                }`}
                style={
                  mf.status === "uploading"
                    ? { width: `${mf.progress}%` }
                    : undefined
                }
              />
            </div>
          )}

          {/* Queued: file size hint */}
          {mf.status === "queued" && (
            <p className="mt-0.5 text-xs text-slate-400">
              {(mf.file.size / 1024).toFixed(0)} KB
            </p>
          )}

          {/* Done: result stats */}
          {mf.status === "done" && mf.result && (
            <div className="mt-1.5 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <PageIcon />
                {mf.result.pages} pages extracted
              </span>
              <span className="flex items-center gap-1 font-semibold text-[var(--accent)]">
                <ChunksIcon />
                {mf.result.chunks_stored} chunks stored
              </span>
            </div>
          )}

          {/* Error message */}
          {mf.status === "error" && mf.error && (
            <p className="mt-1 truncate text-xs text-red-600 dark:text-red-400">
              {mf.error}
            </p>
          )}
        </div>

        {/* Remove button — not shown while actively uploading/processing */}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-1 shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label={`Remove ${mf.file.name}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}

// ── Document card (indexed library) ──────────────────────────────────────────

function DocumentCard({
  doc,
  onRemove,
}: {
  doc: FileResult;
  onRemove: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start gap-3">
        <PdfFileIcon />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className="break-all text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100"
              title={doc.filename}
            >
              {doc.filename}
            </p>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckIcon />
              Indexed
            </span>
          </div>

          {/* Stats chips */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
              <PageIcon />
              <span className="font-medium">{doc.pages}</span> pages
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-[var(--accent-soft)] px-2.5 py-1 text-xs text-[var(--accent)]">
              <ChunksIcon />
              <span className="font-bold">{doc.chunks_stored}</span> chunks stored
            </div>
          </div>
        </div>
      </div>

      {/* Extraction preview toggle */}
      {doc.preview && (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={() => setPreviewOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
          >
            <ChevronIcon expanded={previewOpen} />
            {previewOpen ? "Hide" : "Show"} extraction preview
          </button>
          {previewOpen && (
            <div className="mt-2.5 max-h-36 overflow-y-auto rounded-lg border border-[var(--border)] bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
              {doc.preview}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex justify-end border-t border-[var(--border)] pt-3 mt-4">
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-slate-400 transition-colors hover:text-red-500"
          aria-label={`Remove ${doc.filename} from library`}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const { documents, addDocuments, removeDocument, clearDocuments } =
    useDocuments();

  const [managedFiles, setManagedFiles] = useState<ManagedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────

  const updateFile = useCallback((id: string, patch: Partial<ManagedFile>) => {
    setManagedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf")
    );
    if (!pdfs.length) {
      setDropError("Only PDF files are accepted.");
      return;
    }
    setDropError(null);
    setManagedFiles((prev) => [
      ...prev,
      ...pdfs.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        status: "queued" as FileStatus,
        progress: 0,
      })),
    ]);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (id: string) =>
    setManagedFiles((prev) => prev.filter((f) => f.id !== id));

  const clearResults = () =>
    setManagedFiles((prev) =>
      prev.filter(
        (f) => f.status === "uploading" || f.status === "processing"
      )
    );

  // ── Upload ───────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    const toProcess = managedFiles.filter((f) => f.status === "queued");
    if (!toProcess.length || isRunning) return;

    setIsRunning(true);
    const indexed: FileResult[] = [];

    for (const mf of toProcess) {
      updateFile(mf.id, { status: "uploading", progress: 0 });
      try {
        const result = await uploadSinglePdf(mf.file, (pct) => {
          updateFile(mf.id, {
            progress: pct,
            status: pct < 100 ? "uploading" : "processing",
          });
        });
        updateFile(mf.id, { status: "done", result, progress: 100 });
        indexed.push(result);
      } catch (err) {
        updateFile(mf.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    if (indexed.length) addDocuments(indexed);
    setIsRunning(false);
  };

  // ── Derived state ────────────────────────────────────────────────────────

  const queuedFiles = managedFiles.filter((f) => f.status === "queued");
  const activeFiles = managedFiles.filter(
    (f) => f.status === "uploading" || f.status === "processing"
  );
  const hasProcessed = managedFiles.some(
    (f) => f.status === "done" || f.status === "error"
  );
  const noneActive = activeFiles.length === 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Stats bar */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Files in queue
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {queuedFiles.length}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Status
          </p>
          {isRunning ? (
            <p className="mt-2 flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
              <SpinnerIcon size={14} />
              {activeFiles.length > 0
                ? `Indexing ${activeFiles.length} file${activeFiles.length > 1 ? "s" : ""}…`
                : "Finishing up…"}
            </p>
          ) : (
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              {queuedFiles.length > 0 ? "Ready to index" : "Idle"}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Total indexed
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--accent)]">
            {documents.length}
          </p>
        </div>
      </div>

      {/* Upload panel */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Upload Literature
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Drop PDF papers below — DeepScholar will extract, chunk, and embed
          them for grounded Q&amp;A.
        </p>

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`mt-6 cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragging
              ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
              : "border-[var(--border)] bg-[var(--surface-subtle)]/50 hover:border-slate-400 dark:hover:border-slate-500"
          }`}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Drop PDF files here to ingest
          </p>
          <p className="mt-1 text-xs text-slate-400">
            or click to browse your files
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={onInputChange}
          />
        </div>

        {dropError && (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {dropError}
          </p>
        )}

        {/* File list — all managed files (queued + active + done/error) */}
        {managedFiles.length > 0 && (
          <ul className="mt-5 space-y-2">
            {managedFiles.map((mf) => (
              <ManagedFileRow
                key={mf.id}
                mf={mf}
                onRemove={
                  mf.status !== "uploading" && mf.status !== "processing"
                    ? () => removeFile(mf.id)
                    : undefined
                }
              />
            ))}
          </ul>
        )}

        {/* Actions row */}
        {managedFiles.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {queuedFiles.length > 0 && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={isRunning}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {isRunning && <SpinnerIcon size={14} />}
                {isRunning
                  ? "Indexing…"
                  : `Index ${queuedFiles.length} file${queuedFiles.length > 1 ? "s" : ""}`}
              </button>
            )}
            {hasProcessed && noneActive && (
              <button
                type="button"
                onClick={clearResults}
                className="text-sm text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
              >
                Clear results
              </button>
            )}
          </div>
        )}
      </div>

      {/* Indexed document library */}
      {documents.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Indexed Library
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {documents.length} document
                {documents.length > 1 ? "s" : ""} · all available in Ask Your
                Papers
              </p>
            </div>
            <button
              type="button"
              onClick={clearDocuments}
              className="shrink-0 text-xs text-slate-400 transition-colors hover:text-red-500"
            >
              Clear all
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.filename}
                doc={doc}
                onRemove={() => removeDocument(doc.filename)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

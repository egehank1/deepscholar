"use client";

import { useCallback, useRef, useState } from "react";
import { uploadPdfs, type FileResult } from "@/lib/api";

interface UploadedFile {
  file: File;
  id: string;
}

export default function UploadPage() {
  const [queued, setQueued] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfs.length === 0) {
      setError("Only PDF files are accepted.");
      return;
    }
    setError(null);
    setResults(null);
    setQueued((prev) => [
      ...prev,
      ...pdfs.map((f) => ({ file: f, id: crypto.randomUUID() })),
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
    setQueued((prev) => prev.filter((f) => f.id !== id));

  const handleUpload = async () => {
    if (queued.length === 0) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await uploadPdfs(queued.map((q) => q.file));
      setResults(res.files);
      setQueued([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Documents queued
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {queued.length}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Processing status
          </p>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            {loading ? "Processing literature..." : "Ready for upload"}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Last batch
          </p>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            {results ? `${results.length} file${results.length > 1 ? "s" : ""} indexed` : "No uploads yet"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Upload Literature
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Add PDF papers to your research workspace. DeepScholar will process,
          chunk, and index them for grounded Q&A.
        </p>

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`mt-8 cursor-pointer rounded-xl border-2 border-dashed px-6 py-14 text-center transition ${
            dragging
              ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
              : "border-[var(--border)] bg-[var(--surface-subtle)]/50 hover:border-slate-400 dark:hover:border-slate-500"
          }`}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100">
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
          <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Drop PDF files to ingest into DeepScholar
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            or click to browse your local files
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

        {/* Queued files */}
        {queued.length > 0 && (
          <ul className="mt-4 space-y-2">
            {queued.map(({ file, id }) => (
              <li
                key={id}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm"
              >
                <span className="truncate text-slate-700 dark:text-slate-200">
                  {file.name}
                </span>
                <span className="ml-4 shrink-0 text-xs text-slate-500">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(id)}
                  className="ml-4 shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Error */}
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </p>
        )}

        {/* Upload button */}
        {queued.length > 0 && (
          <button
            type="button"
            onClick={handleUpload}
            disabled={loading}
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {loading && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            )}
            {loading ? "Processing documents..." : `Index ${queued.length} file${queued.length > 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">
            Upload Results
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-subtle)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
                    File
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-slate-600 dark:text-slate-300">
                    Pages
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-slate-600 dark:text-slate-300">
                    Chunks stored
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {results.map((r) => (
                  <tr key={r.filename} className="bg-[var(--surface)]">
                    <td className="max-w-xs truncate px-4 py-2 text-slate-800 dark:text-slate-200">
                      {r.filename}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-300">
                      {r.pages}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-[var(--accent)]">
                      {r.chunks_stored}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Indexed documents are now available inside Ask Your Papers.
          </p>
        </div>
      )}
    </div>
  );
}

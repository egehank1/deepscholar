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
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Upload
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Add PDF papers to your workspace. They will be chunked, embedded, and
        made searchable via chat.
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
        className={`mt-8 cursor-pointer rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragging
            ? "border-teal-500 bg-teal-50/40 dark:bg-teal-900/10"
            : "border-zinc-300 bg-zinc-50/50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/30 dark:hover:border-zinc-500"
        }`}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
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
        <p className="mt-4 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Drag and drop PDF files here
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          or click to browse
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
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="truncate text-zinc-700 dark:text-zinc-300">
                {file.name}
              </span>
              <span className="ml-4 shrink-0 text-xs text-zinc-400">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => removeFile(id)}
                className="ml-4 shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
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
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Upload button */}
      {queued.length > 0 && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={loading}
          className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
          {loading ? "Uploading…" : `Upload ${queued.length} file${queued.length > 1 ? "s" : ""}`}
        </button>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Upload results
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">
                    File
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
                    Pages
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
                    Chunks stored
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {results.map((r) => (
                  <tr key={r.filename} className="bg-white dark:bg-zinc-950">
                    <td className="max-w-xs truncate px-4 py-2 text-zinc-800 dark:text-zinc-200">
                      {r.filename}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                      {r.pages}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-teal-700 dark:text-teal-400">
                      {r.chunks_stored}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
            Files are now searchable via the Chat page.
          </p>
        </div>
      )}
    </div>
  );
}

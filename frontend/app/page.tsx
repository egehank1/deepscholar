import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm sm:p-10">
        <p className="mb-3 inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
          Research Workspace
        </p>
        <h1 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
          Academic intelligence for literature analysis and grounded AI dialogue
        </h1>
        <p className="mt-4 max-w-2xl text-balance text-base leading-relaxed text-slate-600 dark:text-slate-300">
          DeepScholar helps you process PDFs, build a searchable research base,
          and ask precise questions against your uploaded papers.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/upload"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Upload Literature
          </Link>
          <Link
            href="/chat"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-medium text-slate-800 transition hover:bg-[var(--surface-subtle)] dark:text-slate-200"
          >
            Open Insights Engine
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Upload Literature
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Add one or multiple PDFs into your document intelligence pipeline.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Document Intelligence
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Papers are parsed and made searchable for context-aware responses.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Ask Your Papers
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Query your corpus and receive grounded answers with citations.
          </p>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-teal-700 dark:text-teal-400">
        AI research copilot
      </p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        Read, upload, and chat with your literature
      </h1>
      <p className="mt-4 text-balance text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
        DeepScholar helps you navigate papers and draft insights. This is a UI
        scaffold; connect your backend when you are ready.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/upload"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Upload papers
        </Link>
        <Link
          href="/chat"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          Open chat
        </Link>
      </div>
    </div>
  );
}

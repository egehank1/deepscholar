export default function UploadPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Upload
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Add PDFs or other documents to your workspace. Backend wiring comes
        later.
      </p>

      <div className="mt-8 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
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
          Drag and drop files here
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          or use the button below (placeholder)
        </p>
        <button
          type="button"
          disabled
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Choose files
        </button>
      </div>
    </div>
  );
}

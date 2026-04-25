export default function ChatPage() {
  return (
    <div className="flex min-h-[calc(100vh-8.5rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Chat
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Ask questions about your library. Messages are not sent anywhere yet.
        </p>
      </div>

      <div className="flex flex-1 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
          <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            Placeholder
          </div>
          <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-500">
            Conversation UI will appear here once the API is connected.
          </p>
        </div>

        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              placeholder="Ask about your papers…"
              className="min-h-11 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500"
              aria-label="Message input (disabled)"
            />
            <button
              type="button"
              disabled
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

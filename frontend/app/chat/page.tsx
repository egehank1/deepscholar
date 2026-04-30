"use client";

import { useEffect, useRef, useState } from "react";
import { askQuestion, type Citation } from "@/lib/api";

interface UserMessage {
  role: "user";
  text: string;
}

interface AssistantMessage {
  role: "assistant";
  text: string;
  citations: Citation[];
}

type Message = UserMessage | AssistantMessage;

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setLoading(true);

    try {
      const res = await askQuestion(question);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: res.answer, citations: res.citations },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8.5rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Chat
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Ask questions about your uploaded papers. Answers are grounded in your
          documents.
        </p>
      </div>

      <div className="flex flex-1 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 && !loading && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                No messages yet
              </div>
              <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-500">
                Upload papers first, then ask questions about them.
              </p>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[75%] rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex flex-col gap-2">
                  <div className="max-w-[85%] rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                  {msg.citations.length > 0 && (
                    <details className="ml-1 max-w-[85%]">
                      <summary className="cursor-pointer select-none text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                        {msg.citations.length} citation
                        {msg.citations.length > 1 ? "s" : ""}
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {msg.citations.map((c, ci) => (
                          <li
                            key={ci}
                            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                          >
                            <p className="font-medium text-teal-700 dark:text-teal-400">
                              [{ci + 1}] {c.source}
                            </p>
                            <p className="mt-1 line-clamp-3 text-zinc-600 dark:text-zinc-400">
                              {c.text}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )
            )}

            {/* Typing indicator */}
            {loading && (
              <div className="flex">
                <div className="rounded-2xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500"
                        style={{ animationDelay: `${d * 150}ms` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your papers…"
              disabled={loading}
              className="min-h-11 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-600"
              aria-label="Message input"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || input.trim() === ""}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

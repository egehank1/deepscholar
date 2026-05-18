"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { askQuestion } from "@/lib/api";
import { useResearchStore, type ChatMessage } from "@/store/useResearchStore";

export default function ChatPage() {
  const uploadedDocuments = useResearchStore((s) => s.uploadedDocuments);
  const chatHistory = useResearchStore((s) => s.chatHistory);
  const addChatMessage = useResearchStore((s) => s.addChatMessage);
  const clearChatHistory = useResearchStore((s) => s.clearChatHistory);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () =>
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setError(null);

    const userMsg: ChatMessage = { role: "user", text: question };
    addChatMessage(userMsg);
    setLoading(true);
    scrollToBottom();

    try {
      const sources = uploadedDocuments.map((d) => d.filename);
      const res = await askQuestion(question, sources);
      addChatMessage({
        role: "assistant",
        text: res.answer,
        citations: res.citations,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
      scrollToBottom();
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Ask Your Papers
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Query your indexed literature and receive grounded, citation-backed
            responses.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            Insights Engine online
          </div>
          {uploadedDocuments.length > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden />
              {uploadedDocuments.length} paper{uploadedDocuments.length > 1 ? "s" : ""} indexed
            </div>
          )}
          {chatHistory.length > 0 && (
            <button
              type="button"
              onClick={clearChatHistory}
              className="text-xs text-slate-400 transition-colors hover:text-red-500"
            >
              Clear chat
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {chatHistory.length === 0 && !loading && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                {uploadedDocuments.length > 0 ? "Research session ready" : "No papers indexed yet"}
              </div>
              <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
                {uploadedDocuments.length > 0
                  ? `${uploadedDocuments.length} paper${uploadedDocuments.length > 1 ? "s" : ""} ready. Ask about methodology, findings, limitations, or key comparisons.`
                  : "Upload PDF papers in the Upload Literature section first, then return here to ask questions."}
              </p>
            </div>
          )}

          <div className="space-y-6">
            {chatHistory.map((msg, i) =>
              msg.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-2.5 text-sm text-white dark:bg-slate-100 dark:text-slate-900">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex flex-col gap-2">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-slate-800 dark:text-slate-100">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-slate-900 dark:text-slate-50">
                            {children}
                          </strong>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-3 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-3 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className="leading-relaxed">{children}</li>
                        ),
                        h3: ({ children }) => (
                          <h3 className="mb-1 mt-3 font-semibold text-slate-900 first:mt-0 dark:text-slate-50">
                            {children}
                          </h3>
                        ),
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                  {msg.citations.length > 0 && (
                    <details className="ml-1 max-w-[85%]">
                      <summary className="cursor-pointer select-none text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
                        {msg.citations.length} citation
                        {msg.citations.length > 1 ? "s" : ""}
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {msg.citations.map((c, ci) => (
                          <li
                            key={ci}
                            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                          >
                            <p className="font-medium text-[var(--accent)]">
                              [{ci + 1}] {c.source}
                            </p>
                            <p className="mt-1 line-clamp-3 text-slate-600 dark:text-slate-300">
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
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)]/70"
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
          <div className="border-t border-[var(--border)] px-4 py-2">
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </p>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-[var(--border)] p-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about methods, claims, evidence, or comparisons..."
              disabled={loading}
              className="min-h-11 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 disabled:opacity-50 dark:text-slate-100"
              aria-label="Message input"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || input.trim() === ""}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

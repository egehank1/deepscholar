"use client";

import { useEffect } from "react";
import { useResearchStore } from "@/store/useResearchStore";
import { fetchIndexedSources } from "@/lib/api";

// The browser keeps its own copy of uploaded papers (for compare/upload views).
// On load, drop any the backend no longer has, e.g. after a RESET_ON_STARTUP
// restart or a wiped database. If the backend is unreachable, keep everything.
function SyncWithBackend() {
  useEffect(() => {
    let cancelled = false;
    fetchIndexedSources()
      .then((sources) => {
        if (cancelled) return;
        const known = new Set(sources);
        const { uploadedDocuments, removeDocument, clearChatHistory } =
          useResearchStore.getState();
        uploadedDocuments
          .filter((d) => !known.has(d.filename))
          .forEach((d) => removeDocument(d.filename));
        if (sources.length === 0) clearChatHistory();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SyncWithBackend />
      {children}
    </>
  );
}

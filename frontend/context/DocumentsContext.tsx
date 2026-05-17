"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { FileResult } from "@/lib/api";

interface DocumentsContextValue {
  documents: FileResult[];
  addDocuments: (incoming: FileResult[]) => void;
  removeDocument: (filename: string) => void;
  clearDocuments: () => void;
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

const STORAGE_KEY = "deepscholar_documents";

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<FileResult[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Rehydrate from localStorage on mount (client only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as FileResult[];
        if (Array.isArray(parsed)) setDocuments(parsed);
      }
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  // Persist whenever documents change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
  }, [documents, hydrated]);

  const addDocuments = useCallback((incoming: FileResult[]) => {
    setDocuments((prev) => {
      // Merge: replace existing entry for same filename, append new ones
      const map = new Map(prev.map((d) => [d.filename, d]));
      incoming.forEach((d) => map.set(d.filename, d));
      return Array.from(map.values());
    });
  }, []);

  const removeDocument = useCallback((filename: string) => {
    setDocuments((prev) => prev.filter((d) => d.filename !== filename));
  }, []);

  const clearDocuments = useCallback(() => {
    setDocuments([]);
  }, []);

  return (
    <DocumentsContext.Provider
      value={{ documents, addDocuments, removeDocument, clearDocuments }}
    >
      {children}
    </DocumentsContext.Provider>
  );
}

export function useDocuments(): DocumentsContextValue {
  const ctx = useContext(DocumentsContext);
  if (!ctx) {
    throw new Error("useDocuments must be used inside <DocumentsProvider>");
  }
  return ctx;
}

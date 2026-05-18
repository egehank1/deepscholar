import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { FileResult, Citation } from "@/lib/api";

// ── Message types ─────────────────────────────────────────────────────────────

export interface UserMessage {
  role: "user";
  text: string;
}

export interface AssistantMessage {
  role: "assistant";
  text: string;
  citations: Citation[];
}

export type ChatMessage = UserMessage | AssistantMessage;

// ── State + Actions ───────────────────────────────────────────────────────────

interface ResearchState {
  uploadedDocuments: FileResult[];
  activeProject: string | null;
  chatHistory: ChatMessage[];
  selectedDocumentsForComparison: string[];
}

interface ResearchActions {
  setUploadedDocuments: (docs: FileResult[]) => void;
  addDocument: (doc: FileResult) => void;
  removeDocument: (filename: string) => void;
  clearDocuments: () => void;
  setActiveProject: (project: string | null) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChatHistory: () => void;
  toggleDocumentSelectionForComparison: (filename: string) => void;
  resetAll: () => void;
}

type ResearchStore = ResearchState & ResearchActions;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useResearchStore = create<ResearchStore>()(
  persist(
    (set) => ({
      uploadedDocuments: [],
      activeProject: null,
      chatHistory: [],
      selectedDocumentsForComparison: [],

      setUploadedDocuments: (docs) => set({ uploadedDocuments: docs }),

      addDocument: (doc) =>
        set((state) => {
          const map = new Map(
            state.uploadedDocuments.map((d) => [d.filename, d])
          );
          map.set(doc.filename, doc);
          return { uploadedDocuments: Array.from(map.values()) };
        }),

      removeDocument: (filename) =>
        set((state) => ({
          uploadedDocuments: state.uploadedDocuments.filter(
            (d) => d.filename !== filename
          ),
          selectedDocumentsForComparison:
            state.selectedDocumentsForComparison.filter((f) => f !== filename),
        })),

      clearDocuments: () =>
        set({ uploadedDocuments: [], selectedDocumentsForComparison: [] }),

      setActiveProject: (project) => set({ activeProject: project }),

      addChatMessage: (message) =>
        set((state) => ({ chatHistory: [...state.chatHistory, message] })),

      clearChatHistory: () => set({ chatHistory: [] }),

      toggleDocumentSelectionForComparison: (filename) =>
        set((state) => ({
          selectedDocumentsForComparison:
            state.selectedDocumentsForComparison.includes(filename)
              ? state.selectedDocumentsForComparison.filter(
                  (f) => f !== filename
                )
              : [...state.selectedDocumentsForComparison, filename],
        })),

      resetAll: () =>
        set({
          uploadedDocuments: [],
          chatHistory: [],
          activeProject: null,
          selectedDocumentsForComparison: [],
        }),
    }),
    {
      name: "deepscholar_store",
      storage: createJSONStorage(() => localStorage),
      // Normalise persisted documents that pre-date the extraction field
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ResearchState>;
        return {
          ...currentState,
          ...persisted,
          uploadedDocuments: (persisted.uploadedDocuments ?? []).map((d) => ({
            ...d,
            extraction: d.extraction ?? {
              title: null,
              authors: [],
              abstract: null,
              methodology: null,
              datasets: [],
              metrics: [],
              limitations: null,
            },
          })),
        };
      },
    }
  )
);

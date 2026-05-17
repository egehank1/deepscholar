"use client";

import { DocumentsProvider } from "@/context/DocumentsContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return <DocumentsProvider>{children}</DocumentsProvider>;
}

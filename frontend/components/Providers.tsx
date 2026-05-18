"use client";

import { useEffect } from "react";
import { useResearchStore } from "@/store/useResearchStore";

function SessionReset() {
  const resetAll = useResearchStore((s) => s.resetAll);

  useEffect(() => {
    // Wipe all local state on every fresh app load so the UI always reflects
    // the backend's clean-on-startup state. Runs once per browser session.
    resetAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SessionReset />
      {children}
    </>
  );
}

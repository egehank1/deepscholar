const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Upload ────────────────────────────────────────────────────────────────────

export interface FileResult {
  filename: string;
  pages: number;
  preview: string;
  chunks_stored: number;
}

export interface UploadResponse {
  files: FileResult[];
  count: number;
}

export async function uploadPdfs(files: File[]): Promise<UploadResponse> {
  const body = new FormData();
  files.forEach((f) => body.append("files", f));

  const res = await fetch(`${API_URL}/upload`, { method: "POST", body });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(
      detail?.detail ?? `Upload failed (HTTP ${res.status})`
    );
  }

  return res.json() as Promise<UploadResponse>;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface Citation {
  text: string;
  source: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
}

export async function askQuestion(question: string): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(
      detail?.detail ?? `Chat failed (HTTP ${res.status})`
    );
  }

  return res.json() as Promise<ChatResponse>;
}

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

/**
 * Upload a single PDF with real XHR upload-progress events.
 *
 * `onProgress` is called with values 0–100 as bytes are sent to the server.
 * After the bytes reach 100 % the server begins chunking + embedding; the
 * returned Promise resolves only once the server sends back the full response.
 */
export function uploadSinglePdf(
  file: File,
  onProgress: (pct: number) => void,
): Promise<FileResult> {
  return new Promise<FileResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append("files", file);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as UploadResponse;
          const first = data.files?.[0];
          if (first) resolve(first);
          else reject(new Error("Server returned an empty file list"));
        } catch {
          reject(new Error("Invalid JSON response from server"));
        }
      } else {
        try {
          const detail = JSON.parse(xhr.responseText) as { detail?: string };
          reject(new Error(detail?.detail ?? `Upload failed (HTTP ${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        }
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload was aborted")));

    xhr.open("POST", `${API_URL}/upload`);
    xhr.send(body);
  });
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

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Upload ────────────────────────────────────────────────────────────────────

export interface PaperExtraction {
  title: string | null;
  authors: string[];
  abstract: string | null;
  methodology: string | null;
  datasets: string[];
  metrics: string[];
  limitations: string | null;
}

export interface FileResult {
  filename: string;
  pages: number;
  preview: string;
  chunks_stored: number;
  extraction: PaperExtraction;
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

// ── Knowledge Graph ───────────────────────────────────────────────────────────

export type NodeType = "paper" | "method" | "dataset" | "task";
export type EdgeRelation = "uses" | "evaluates_on" | "addresses" | "improves";

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  meta: {
    source?: string;
    authors?: string[];
    abstract?: string;
    methodology?: string;
  };
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function fetchKnowledgeGraph(): Promise<KnowledgeGraphData> {
  const res = await fetch(`${API_URL}/api/knowledge-graph`);
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Knowledge graph fetch failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<KnowledgeGraphData>;
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

export async function askQuestion(
  question: string,
  sources: string[] = [],
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, sources }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(
      detail?.detail ?? `Chat failed (HTTP ${res.status})`
    );
  }

  return res.json() as Promise<ChatResponse>;
}

// ── Evaluation / Analytics ────────────────────────────────────────────────────

export interface EvalMetrics {
  retrieval_precision: number | null;
  citation_correctness: number | null;
  answer_faithfulness: number | null;
  overall_score: number | null;
}

export interface EvaluationLog {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
  retrieval_stats: Record<string, unknown>;
  retrieval_precision: number | null;
  citation_correctness: number | null;
  answer_faithfulness: number | null;
  overall_score: number | null;
  created_at: string;
}

export interface DailyTrend {
  date: string;
  queries: number;
  avg_score: number | null;
}

export interface EvaluationAnalytics {
  total_queries: number;
  avg_retrieval_precision: number | null;
  avg_citation_correctness: number | null;
  avg_answer_faithfulness: number | null;
  avg_overall_score: number | null;
  first_query_at: string | null;
  last_query_at: string | null;
  daily_trend: DailyTrend[];
}

export interface EvaluationLogsResponse {
  logs: EvaluationLog[];
  limit: number;
  offset: number;
}

export async function fetchEvaluationLogs(
  limit = 50,
  offset = 0,
): Promise<EvaluationLogsResponse> {
  const res = await fetch(
    `${API_URL}/api/evaluation/logs?limit=${limit}&offset=${offset}`,
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Evaluation logs fetch failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<EvaluationLogsResponse>;
}

export async function fetchEvaluationAnalytics(): Promise<EvaluationAnalytics> {
  const res = await fetch(`${API_URL}/api/evaluation/analytics`);
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Analytics fetch failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<EvaluationAnalytics>;
}

export async function clearEvaluationLogs(): Promise<{ deleted: number }> {
  const res = await fetch(`${API_URL}/api/evaluation/logs`, { method: "DELETE" });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Clear failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<{ deleted: number }>;
}

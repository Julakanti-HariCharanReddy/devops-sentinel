import type {
  AnalyzeResponse, Engine, Health, IncidentDetail, IncidentStatus, IncidentSummary, Overview,
  ParseResult, ParseStats, Analysis, Scenario, ServicesResponse,
} from "../types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const CODE_KEY = "sentinel.accessCode";
export const ACCESS_EVENT = "sentinel:access-required";

/** Shared access code for protected deployments; kept per browser. */
export const accessCode = {
  get: () => { try { return localStorage.getItem(CODE_KEY) ?? ""; } catch { return ""; } },
  set: (v: string) => { try { localStorage.setItem(CODE_KEY, v); } catch { /* storage unavailable */ } },
  clear: () => { try { localStorage.removeItem(CODE_KEY); } catch { /* storage unavailable */ } },
};

function authHeaders(code = accessCode.get()): Record<string, string> {
  return code ? { "X-Access-Code": code } : {};
}

async function request<T>(path: string, init?: RequestInit, code?: string): Promise<T> {
  let res: Response;
  const base: Record<string, string> = init?.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  try {
    res = await fetch(BASE + path, { ...init, headers: { ...base, ...authHeaders(code), ...(init?.headers as Record<string, string> | undefined) } });
  } catch {
    throw new ApiError(0, "BACKEND_UNREACHABLE", "Cannot reach the backend. Is it running?");
  }
  if (res.status === 401 && code === undefined) window.dispatchEvent(new Event(ACCESS_EVENT));
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* non-JSON error */ }
    const d = body?.detail;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      throw new ApiError(res.status, d.code ?? "ERROR", d.message ?? "Request failed");
    }
    const msg = Array.isArray(d) ? d.map((x: any) => x.msg).join("; ") : d ?? res.statusText;
    throw new ApiError(res.status, "HTTP_" + res.status, String(msg));
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/api/health"),
  testAi: () => request<{ ok: boolean; model?: string; code?: string; message?: string }>("/api/ai/test", { method: "POST" })
    .catch((e: ApiError) => ({ ok: false, code: e.code, message: e.message })),
  overview: () => request<Overview>("/api/overview"),
  services: () => request<ServicesResponse>("/api/services"),
  refreshServices: () => request<ServicesResponse>("/api/services/refresh", { method: "POST" }),
  scenarios: () => request<Scenario[]>("/api/scenarios"),
  scenario: (id: string) => request<Scenario & { logs: string }>(`/api/scenarios/${id}`),
  parse: (logs: string) => request<ParseResult>("/api/logs/parse", { method: "POST", body: JSON.stringify({ logs }) }),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ filename: string; logs: string; bytes: number }>("/api/logs/upload", { method: "POST", body: fd });
  },
  analyze: (logs: string, source_name: string | null) =>
    request<AnalyzeResponse>("/api/incidents/analyze", {
      method: "POST", body: JSON.stringify({ logs, source_name }),
    }),
  saveIncident: (p: { engine: Engine; model: string | null; analysis: Analysis; source_name: string | null; stats: ParseStats }) =>
    request<IncidentDetail>("/api/incidents", { method: "POST", body: JSON.stringify(p) }),
  incidents: (params: { q?: string; severity?: string; status?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return request<IncidentSummary[]>(`/api/incidents?${qs}`);
  },
  incident: (id: string) => request<IncidentDetail>(`/api/incidents/${id}`),
  setStatus: (id: string, status: IncidentStatus) =>
    request<IncidentDetail>(`/api/incidents/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  verifyAccess: (code: string) => request<Scenario[]>("/api/scenarios", undefined, code),
  download: async (id: string, format: "md" | "json") => {
    const res = await fetch(`${BASE}/api/incidents/${id}/export?format=${format}`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError(res.status, "EXPORT_FAILED", "Export failed");
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `${id}.${format}` });
    a.click();
    URL.revokeObjectURL(url);
  },
};

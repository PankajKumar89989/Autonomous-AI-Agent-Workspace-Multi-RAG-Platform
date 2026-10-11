import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { API_URL, ApiError, api, refreshSession } from "@/lib/api";
import type { Page } from "@/lib/workspaces";
import { useAuthStore } from "@/store/auth";

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type RunStep = {
  id: string;
  agent: string;
  task: string;
  status: StepStatus;
  attempts: number;
  duration_ms: number | null;
  summary: string | null;
  error: string | null;
  fallback: boolean;
};

export type Evidence = {
  n: number;
  kind: "document" | "web";
  title: string;
  url: string | null;
  domain: string | null;
  page_number: number | null;
  document_id: string | null;
  knowledge_base_id: string | null;
  content: string;
  score: number;
  retrieved_at: string | null;
  cited: boolean;
};

export type RunView = {
  id: string | null;
  objective: string;
  status: RunStatus;
  steps: RunStep[];
  report: string;
  sources: Evidence[];
  warnings: string[];
  duration_ms: number | null;
  error: string | null;
};

export type RunSummary = { id: string; objective: string; status: RunStatus; duration_ms: number | null; created_at: string; agent_name: string | null };
export type RunDetail = RunSummary & {
  options: { use_web?: boolean; length?: string };
  steps: RunStep[];
  report: string;
  sources: Evidence[];
  warnings: string[];
  error_message: string | null;
  cancel_requested: boolean;
};

export type SourceItem = Omit<Evidence, "content" | "score"> & { id: string; run_id: string; run_objective: string; created_at: string };

export const isActive = (status: RunStatus | undefined) => status === "queued" || status === "running";

export const emptyRun = (objective: string, status: RunStatus = "running"): RunView => ({
  id: null, objective, status, steps: [], report: "", sources: [], warnings: [], duration_ms: null, error: null,
});

export function fromDetail(d: RunDetail): RunView {
  return { id: d.id, objective: d.objective, status: d.status, steps: d.steps, report: d.report, sources: d.sources, warnings: d.warnings, duration_ms: d.duration_ms, error: d.error_message };
}

/** Folds one server event into the on-screen run. Replaying the whole log from the start gives the same result. */
export function reduceEvent(state: RunView, event: string, data: any): RunView {
  switch (event) {
    case "run":
      return { ...state, id: data.run_id, status: "running" };
    case "plan":
      return { ...state, steps: data.steps };
    case "step": {
      const exists = state.steps.some((s) => s.id === data.id);
      return { ...state, steps: exists ? state.steps.map((s) => (s.id === data.id ? data : s)) : [...state.steps, data] };
    }
    case "sources":
      return { ...state, sources: data.sources };
    case "report":
      return { ...state, report: data.markdown, sources: data.sources.length ? data.sources : state.sources };
    case "done":
      return { ...state, status: "completed", warnings: data.warnings, duration_ms: data.duration_ms };
    case "cancelled":
      return { ...state, status: "cancelled" };
    case "error":
      return { ...state, status: "failed", error: data.message, warnings: data.warnings ?? state.warnings };
    default:
      return state;
  }
}

export function useRuns() {
  return useQuery({
    queryKey: ["agent-runs"],
    queryFn: () => api<Page<RunSummary>>("/research?page_size=20"),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some((r) => isActive(r.status)) ? 4000 : false),
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ["agent-run", id],
    queryFn: () => api<RunDetail>(`/research/${id}`),
    retry: false,
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 4000 : false), // fallback if the live stream drops
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ["agent-runs"] });
    void qc.invalidateQueries({ queryKey: ["research-sources"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
    if (id) void qc.invalidateQueries({ queryKey: ["agent-run", id] });
  };
}

export type StartInput = { objective: string; knowledge_base_ids?: string[]; use_web: boolean; length?: string; agent_id?: string };

export function useStartRun() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: StartInput) => api<RunDetail>("/research", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => refresh(),
  });
}

export function useCancelRun(id: string) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => api(`/research/${id}/cancel`, { method: "POST" }), onSuccess: () => refresh(id) });
}

export function useRerun() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: string) => api<RunDetail>(`/research/${id}/rerun`, { method: "POST" }), onSuccess: () => refresh() });
}

export function useDeleteRun() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: string) => api<{ message: string }>(`/research/${id}`, { method: "DELETE" }), onSuccess: () => refresh() });
}

export function useSourceLibrary(opts: { kind: string; q: string; page: number }) {
  return useQuery({
    queryKey: ["research-sources", opts],
    queryFn: () => {
      const params = new URLSearchParams({ q: opts.q, page: String(opts.page), page_size: "20" });
      if (opts.kind) params.set("kind", opts.kind);
      return api<Page<SourceItem>>(`/research/sources?${params}`);
    },
    placeholderData: keepPreviousData,
  });
}

/** Downloads a finished report. Uses fetch (not a link) because the request needs the auth header. */
export async function downloadExport(id: string, format: "markdown" | "pdf"): Promise<void> {
  const get = () =>
    fetch(`${API_URL}/api/research/${id}/export?format=${format}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}` },
    });
  let res = await get();
  if (res.status === 401) {
    await refreshSession();
    res = await get();
  }
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(json?.error?.code ?? "UNKNOWN_ERROR", json?.error?.message ?? "Export failed.", res.status);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `research.${format === "pdf" ? "pdf" : "md"}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

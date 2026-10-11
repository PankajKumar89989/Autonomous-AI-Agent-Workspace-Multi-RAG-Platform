import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Page } from "@/lib/workspaces";

export type ResponseStyle = "concise" | "balanced" | "detailed";

export type Agent = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model: string | null;
  temperature: number;
  knowledge_base_ids: string[];
  tools: string[];
  research_mode: boolean;
  max_steps: number;
  response_style: ResponseStyle;
  created_at: string;
  updated_at: string;
};

export type AgentInput = Omit<Agent, "id" | "created_at" | "updated_at">;

export type ToolInfo = { name: string; label: string; description: string; available: boolean; unavailable_reason: string | null };
export type AgentOptions = { models: string[]; default_model: string; tools: ToolInfo[]; styles: ResponseStyle[] };

export const DEFAULT_AGENT: AgentInput = {
  name: "",
  description: "",
  instructions: "",
  model: null,
  temperature: 0.2,
  knowledge_base_ids: [],
  tools: ["search_documents"],
  research_mode: false,
  max_steps: 3,
  response_style: "balanced",
};

export function useAgents() {
  return useQuery({ queryKey: ["agents"], queryFn: () => api<Page<Agent>>("/agents?page_size=100") });
}

export function useAgent(id: string) {
  return useQuery({ queryKey: ["agent", id], queryFn: () => api<Agent>(`/agents/${id}`), retry: false });
}

export function useAgentOptions() {
  return useQuery({ queryKey: ["agent-options"], queryFn: () => api<AgentOptions>("/agents/options"), staleTime: 60_000 });
}

function useRefresh() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ["agents"] });
    if (id) void qc.invalidateQueries({ queryKey: ["agent", id] });
  };
}

export function useCreateAgent() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: AgentInput) => api<Agent>("/agents", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => refresh(),
  });
}

export function useUpdateAgent(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: AgentInput) => api<Agent>(`/agents/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => refresh(id),
  });
}

export function useDeleteAgent() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/agents/${id}`, { method: "DELETE" }),
    onSuccess: () => refresh(),
  });
}

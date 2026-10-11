import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export type Overview = {
  stats: {
    workspaces: number;
    documents: number;
    knowledge_bases: number;
    conversations: number;
    research_tasks: number;
    ai_requests: number;
  };
  recent_activity: { id: string; type: string; message: string; workspace_id: string | null; created_at: string }[];
};

export function useOverview() {
  return useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/dashboard/overview") });
}

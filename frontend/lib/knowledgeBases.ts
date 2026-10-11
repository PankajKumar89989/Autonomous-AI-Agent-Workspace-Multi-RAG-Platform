import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Page } from "@/lib/workspaces";

export type KnowledgeBase = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  name: string;
  description: string;
  chunk_size: number;
  chunk_overlap: number;
  document_count: number;
  indexed_count: number;
  created_at: string;
  updated_at: string;
};

export type KnowledgeBaseInput = { name: string; description: string; chunk_size: number; chunk_overlap: number };

type ListOptions = { workspaceId?: string; q?: string; page?: number };

export function useKnowledgeBases({ workspaceId, q = "", page = 1 }: ListOptions = {}) {
  return useQuery({
    queryKey: ["knowledge-bases", { workspaceId, q, page }],
    queryFn: () => {
      const params = new URLSearchParams({ q, page: String(page), page_size: "12" });
      if (workspaceId) params.set("workspace_id", workspaceId);
      return api<Page<KnowledgeBase>>(`/knowledge-bases?${params}`);
    },
    placeholderData: keepPreviousData,
  });
}

/** Up to 100 knowledge bases, for pickers. */
export function useAllKnowledgeBases() {
  return useQuery({
    queryKey: ["knowledge-bases", "all"],
    queryFn: () => api<Page<KnowledgeBase>>("/knowledge-bases?page_size=100"),
  });
}

export function useKnowledgeBase(id: string) {
  return useQuery({ queryKey: ["knowledge-base", id], queryFn: () => api<KnowledgeBase>(`/knowledge-bases/${id}`), retry: false });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
  };
}

export function useCreateKnowledgeBase() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: KnowledgeBaseInput & { workspace_id: string }) =>
      api<KnowledgeBase>("/knowledge-bases", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

export function useUpdateKnowledgeBase(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Partial<KnowledgeBaseInput>) =>
      api<KnowledgeBase>(`/knowledge-bases/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: (kb) => {
      qc.setQueryData(["knowledge-base", id], kb);
      invalidate();
    },
  });
}

export function useDeleteKnowledgeBase() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/knowledge-bases/${id}`, { method: "DELETE" }),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ["knowledge-base", id] });
      qc.removeQueries({ queryKey: ["documents", id] });
      invalidate();
    },
  });
}

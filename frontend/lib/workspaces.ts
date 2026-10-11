import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export type Workspace = { id: string; name: string; description: string; created_at: string; updated_at: string };
export type Page<T> = { items: T[]; total: number; page: number; page_size: number };
export type WorkspaceInput = { name: string; description: string };

export const PAGE_SIZE = 12;

export function useWorkspaces(q: string, page: number) {
  return useQuery({
    queryKey: ["workspaces", { q, page }],
    queryFn: () => {
      const params = new URLSearchParams({ q, page: String(page), page_size: String(PAGE_SIZE) });
      return api<Page<Workspace>>(`/workspaces?${params}`);
    },
    placeholderData: keepPreviousData,
  });
}

/** Up to 100 workspaces, for pickers. */
export function useAllWorkspaces() {
  return useQuery({
    queryKey: ["workspaces", "all"],
    queryFn: () => api<Page<Workspace>>("/workspaces?page_size=100"),
  });
}

export function useWorkspace(id: string) {
  return useQuery({ queryKey: ["workspace", id], queryFn: () => api<Workspace>(`/workspaces/${id}`), retry: false });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["workspaces"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
  };
}

export function useCreateWorkspace() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: WorkspaceInput) => api<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

export function useUpdateWorkspace(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Partial<WorkspaceInput>) =>
      api<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: (workspace) => {
      qc.setQueryData(["workspace", id], workspace);
      invalidate();
    },
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/workspaces/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: ["workspace", id] });
      invalidate();
    },
  });
}

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Page } from "@/lib/workspaces";

export type DocumentStatus = "uploaded" | "processing" | "completed" | "failed";

export type DocumentRecord = {
  id: string;
  knowledge_base_id: string;
  filename: string;
  source_type: string;
  mime_type: string;
  size_bytes: number;
  status: DocumentStatus;
  error_message: string | null;
  page_count: number | null;
  chunk_count: number;
  embedding_model: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

export type Chunk = { id: string; chunk_index: number; page_number: number | null; content: string; token_count: number };

const IN_PROGRESS: DocumentStatus[] = ["uploaded", "processing"];

/** Polls every 2s while any document is still being processed. */
export function useDocuments(kbId: string, q: string, page: number) {
  return useQuery({
    queryKey: ["documents", kbId, { q, page }],
    queryFn: () => {
      const params = new URLSearchParams({ knowledge_base_id: kbId, q, page: String(page), page_size: "20" });
      return api<Page<DocumentRecord>>(`/documents?${params}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some((d) => IN_PROGRESS.includes(d.status)) ? 2000 : false),
  });
}

function useRefresh(kbId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["documents", kbId] });
    void qc.invalidateQueries({ queryKey: ["knowledge-base", kbId] });
    void qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
  };
}

export function useUploadDocument(kbId: string) {
  const refresh = useRefresh(kbId);
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("knowledge_base_id", kbId);
      form.append("file", file);
      return api<DocumentRecord>("/documents/upload", { method: "POST", body: form });
    },
    onSuccess: refresh,
  });
}

export function useDeleteDocument(kbId: string) {
  const refresh = useRefresh(kbId);
  return useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}

export function useReindexDocument(kbId: string) {
  const refresh = useRefresh(kbId);
  return useMutation({
    mutationFn: (id: string) => api<DocumentRecord>(`/documents/${id}/reindex`, { method: "POST" }),
    onSuccess: refresh,
  });
}

export function useChunks(documentId: string, page: number) {
  return useQuery({
    queryKey: ["chunks", documentId, page],
    queryFn: () => api<Page<Chunk>>(`/documents/${documentId}/chunks?page=${page}&page_size=10`),
    placeholderData: keepPreviousData,
  });
}

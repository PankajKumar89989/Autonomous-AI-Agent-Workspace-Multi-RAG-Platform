import { useMutation, useQuery } from "@tanstack/react-query";

import { api, request } from "@/lib/api";

export type SearchHit = {
  chunk_id: string;
  document_id: string;
  knowledge_base_id: string;
  document_name: string;
  source_type: string;
  page_number: number | null;
  chunk_index: number;
  content: string;
  score: number;
  vector_score: number | null;
  keyword_score: number | null;
  sources: ("vector" | "keyword")[];
};

export type SearchResult = { query: string; mode: string; results: SearchHit[]; warnings: string[]; took_ms: number };

export type SearchInput = {
  query: string;
  knowledge_base_ids?: string[];
  workspace_id?: string;
  top_k?: number;
  mode?: "hybrid" | "vector" | "keyword";
};

export function useSearch() {
  return useMutation({
    mutationFn: (input: SearchInput) => api<SearchResult>("/search", { method: "POST", body: JSON.stringify(input) }),
  });
}

export type Health = {
  status: string;
  database: boolean;
  providers: { embeddings: "openai" | "mock"; vector_store: "pinecone" | "local"; chat: "openai" | "mock"; reranker: string; web_search: "tavily" | "none" };
};

export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: () => request<Health>("/health"), staleTime: 60_000 });
}

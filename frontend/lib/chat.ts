import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { API_URL, ApiError, api, refreshSession } from "@/lib/api";
import type { Page } from "@/lib/workspaces";
import { useAuthStore } from "@/store/auth";

export type Source = {
  n: number;
  chunk_id: string | null;
  document_id: string | null;
  knowledge_base_id: string | null;
  document_name: string;
  page_number: number | null;
  chunk_index: number | null;
  source_type: string;
  content: string;
  score: number;
  cited: boolean;
  kind: "document" | "web" | "tool";
  url: string | null;
  domain: string | null;
};

export type Stage = "retrieving" | "tools" | "reranking" | "generating";

export type ChatMessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "stopped" | "failed";
  sources: Source[] | null;
  model: string | null;
  error_message: string | null;
  created_at: string;
};

/** A message as shown on screen, including live streaming state. */
export type LocalMessage = ChatMessageRecord & { stage?: Stage; warnings?: string[] };

export type Conversation = {
  id: string;
  title: string;
  workspace_id: string | null;
  agent_id: string | null;
  knowledge_base_ids: string[];
  created_at: string;
  updated_at: string;
};

export type ConversationDetail = { conversation: Conversation; messages: ChatMessageRecord[] };

export type ChatBody = {
  conversation_id?: string;
  message?: string;
  knowledge_base_ids?: string[];
  agent_id?: string;
  regenerate?: boolean;
};

export type StreamHandlers = {
  onMeta: (m: { conversation_id: string; user_message_id: string; assistant_message_id: string; title: string }) => void;
  onStatus: (s: { stage: Stage }) => void;
  onSources: (s: { sources: Source[]; search_query: string }) => void;
  onToken: (t: { text: string }) => void;
  onDone: (d: { assistant_message_id: string; sources: Source[]; warnings: string[]; model: string | null }) => void;
  onError: (e: { code: string; message: string }) => void;
};

function dispatch(block: string, h: StreamHandlers) {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return;
  const payload = JSON.parse(data.join("\n"));
  if (event === "meta") h.onMeta(payload);
  else if (event === "status") h.onStatus(payload);
  else if (event === "sources") h.onSources(payload);
  else if (event === "token") h.onToken(payload);
  else if (event === "done") h.onDone(payload);
  else if (event === "error") h.onError(payload);
}

async function openStream(body: ChatBody, signal: AbortSignal): Promise<Response> {
  const send = () =>
    fetch(`${API_URL}/api/chat`, {
      method: "POST",
      credentials: "include",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}` },
      body: JSON.stringify(body),
    });
  let res = await send();
  if (res.status === 401) {
    await refreshSession();
    res = await send();
  }
  return res;
}

/** POSTs to /chat and feeds Server-Sent Events to the handlers. Rejects with AbortError when stopped. */
export async function streamChat(body: ChatBody, handlers: StreamHandlers, signal: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await openStream(body, signal);
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError("NETWORK_ERROR", "Cannot reach the server. Is the backend running?", 0);
  }
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null);
    throw new ApiError(json?.error?.code ?? "UNKNOWN_ERROR", json?.error?.message ?? "Request failed.", res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      dispatch(block, handlers);
    }
  }
}

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<Page<Conversation>>("/conversations?page_size=50"),
    placeholderData: keepPreviousData,
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/conversations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

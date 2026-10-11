"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, SendHorizontal, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { KeyboardEvent, useEffect, useRef, useState } from "react";

import ChatMessageView from "@/components/ChatMessageView";
import ConfirmDialog from "@/components/ConfirmDialog";
import ProviderNote from "@/components/ProviderNote";
import SourceModal from "@/components/SourceModal";
import { ApiError, api } from "@/lib/api";
import {
  streamChat,
  useConversations,
  useDeleteConversation,
  type ChatBody,
  type Conversation,
  type ConversationDetail,
  type LocalMessage,
  type Source,
} from "@/lib/chat";
import { timeAgo } from "@/lib/format";
import { useAgents } from "@/lib/agents";
import { useAllKnowledgeBases } from "@/lib/knowledgeBases";
import { toast } from "@/store/toast";

function blankMessage(role: "user" | "assistant", content: string): LocalMessage {
  return {
    id: `local-${role}-${Date.now()}`,
    role,
    content,
    status: role === "assistant" ? "streaming" : "complete",
    sources: null,
    model: null,
    error_message: null,
    created_at: new Date().toISOString(),
    stage: role === "assistant" ? "retrieving" : undefined,
  };
}

export default function ChatView() {
  const qc = useQueryClient();
  const conversations = useConversations();
  const knowledgeBases = useAllKnowledgeBases();
  const agents = useAgents();
  const removeConversation = useDeleteConversation();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [scopeLabel, setScopeLabel] = useState("");
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [scope, setScope] = useState<string[]>([]);
  const [agentId, setAgentId] = useState("");
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const existing = params.get("c");
    const kb = params.get("kb");
    const agent = params.get("agent");
    if (existing) void openConversation(existing);
    else if (agent) setAgentId(agent);
    else if (kb) setScope([kb]);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openConversation(id: string) {
    abortRef.current?.abort();
    setLoading(true);
    try {
      const detail = await api<ConversationDetail>(`/conversations/${id}`);
      setConversationId(id);
      setMessages(detail.messages);
      setActiveAgentId(detail.conversation.agent_id);
      const ids = detail.conversation.knowledge_base_ids;
      setScopeLabel(ids.length === 0 ? "all your knowledge bases" : `${ids.length} selected knowledge ${ids.length === 1 ? "base" : "bases"}`);
      window.history.replaceState(null, "", `/chat?c=${id}`);
    } catch {
      toast.error("That conversation could not be opened.");
      newChat();
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setScopeLabel("");
    setScope([]);
    setAgentId("");
    setActiveAgentId(null);
    window.history.replaceState(null, "", "/chat");
  }

  async function run(body: ChatBody, userText?: string) {
    setStreaming(true);
    const draft = blankMessage("assistant", "");
    let currentId = draft.id;
    setMessages((prev) => [...prev, ...(userText ? [blankMessage("user", userText)] : []), draft]);
    const patch = (fn: (m: LocalMessage) => LocalMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === currentId ? fn(m) : m)));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(
        body,
        {
          onMeta: (meta) => {
            const previousId = currentId;
            currentId = meta.assistant_message_id;
            setMessages((prev) => prev.map((m) => (m.id === previousId ? { ...m, id: currentId } : m)));
            setConversationId(meta.conversation_id);
            setActiveAgentId(body.agent_id ?? activeAgentId);
            window.history.replaceState(null, "", `/chat?c=${meta.conversation_id}`);
            void qc.invalidateQueries({ queryKey: ["conversations"] });
          },
          onStatus: ({ stage }) => patch((m) => ({ ...m, stage })),
          onSources: ({ sources }) => patch((m) => ({ ...m, sources })),
          onToken: ({ text }) => patch((m) => ({ ...m, content: m.content + text })),
          onDone: (d) => patch((m) => ({ ...m, status: "complete", stage: undefined, sources: d.sources, warnings: d.warnings, model: d.model })),
          onError: (e) => patch((m) => ({ ...m, status: "failed", stage: undefined, error_message: e.message })),
        },
        controller.signal,
      );
    } catch (err) {
      if (controller.signal.aborted) {
        patch((m) => ({ ...m, status: "stopped", stage: undefined }));
      } else {
        const message = err instanceof ApiError ? err.message : "Something went wrong. Try again.";
        patch((m) => ({ ...m, status: "failed", stage: undefined, error_message: message }));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
    }
  }

  function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    void run(
      {
        conversation_id: conversationId ?? undefined,
        message: text,
        knowledge_base_ids: conversationId || agentId || scope.length === 0 ? undefined : scope,
        agent_id: conversationId || !agentId ? undefined : agentId,
      },
      text,
    );
  }

  function regenerate() {
    if (!conversationId || streaming) return;
    setMessages((prev) => (prev[prev.length - 1]?.role === "assistant" ? prev.slice(0, -1) : prev));
    void run({ conversation_id: conversationId, regenerate: true });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await removeConversation.mutateAsync(deleting.id);
      if (deleting.id === conversationId) newChat();
      toast.success("Conversation deleted");
    } catch {
      toast.error("Could not delete the conversation.");
    }
    setDeleting(null);
  }

  const isNew = !conversationId && messages.length === 0;
  const agentItems = agents.data?.items ?? [];
  const activeAgent = agentItems.find((a) => a.id === activeAgentId);
  const chosenAgent = agentItems.find((a) => a.id === agentId);
  const kbItems = knowledgeBases.data?.items ?? [];
  const lastIndex = messages.length - 1;

  return (
    <div className="space-y-4">
      <ProviderNote />
      <div className="grid gap-4 md:h-[calc(100vh-12rem)] md:grid-cols-[15rem_1fr]">
        <aside className="panel flex max-h-48 flex-col overflow-hidden md:max-h-none" aria-label="Conversations">
          <div className="p-3">
            <button className="btn-primary w-full" onClick={newChat}>
              <MessageSquarePlus size={16} /> New chat
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {conversations.data?.items.map((c) => (
              <li key={c.id} className="group flex items-center">
                <button
                  onClick={() => void openConversation(c.id)}
                  aria-current={c.id === conversationId ? "true" : undefined}
                  className={`min-w-0 flex-1 px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800 ${
                    c.id === conversationId ? "bg-stone-100 font-medium dark:bg-stone-800" : ""
                  }`}
                >
                  <span className="block truncate">{c.title}</span>
                  <span className="block text-xs text-stone-500">{timeAgo(c.updated_at)}</span>
                </button>
                <button
                  onClick={() => setDeleting(c)}
                  aria-label={`Delete conversation ${c.title}`}
                  className="mr-1 rounded p-1.5 text-stone-400 hover:bg-stone-200 hover:text-rose-600 dark:hover:bg-stone-700"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
            {conversations.data?.items.length === 0 && <li className="px-3 py-2 text-sm text-stone-500">No conversations yet.</li>}
          </ul>
        </aside>

        <section className="panel flex min-h-[28rem] min-w-0 flex-col" aria-label="Chat" aria-busy={streaming}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {loading ? (
              <p className="text-sm text-stone-500" role="status">Loading conversation...</p>
            ) : isNew ? (
              <div className="mx-auto max-w-lg space-y-4 py-6 text-sm">
                <div>
                  <h1 className="text-xl font-bold">Ask your documents</h1>
                  <p className="mt-1 text-stone-600 dark:text-stone-400">
                    Answers come only from your knowledge bases and cite their sources. If the documents don&apos;t cover a question, you&apos;ll be told.
                  </p>
                </div>
                <label className="block space-y-1 font-medium">
                  Agent
                  <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="input">
                    <option value="">No agent (plain document chat)</option>
                    {agentItems.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <span className="block text-xs font-normal text-stone-500">
                    {chosenAgent ? "The agent's instructions, model, documents and tools apply." : <>Or <Link href="/agents/new" className="underline">build an agent</Link> with its own instructions and tools.</>}
                  </span>
                </label>
                {chosenAgent ? null : kbItems.length === 0 && !knowledgeBases.isLoading ? (
                  <p>
                    You have no knowledge bases yet. <Link href="/knowledge-bases" className="text-teal-700 underline dark:text-teal-400">Create one and upload documents</Link> first.
                  </p>
                ) : (
                  <fieldset className="space-y-2">
                    <legend className="font-medium">Search in</legend>
                    <p className="text-stone-600 dark:text-stone-400">Leave everything unticked to search all your knowledge bases.</p>
                    <ul className="max-h-40 space-y-1 overflow-y-auto">
                      {kbItems.map((kb) => (
                        <li key={kb.id}>
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={scope.includes(kb.id)}
                              onChange={(e) => setScope((prev) => (e.target.checked ? [...prev, kb.id] : prev.filter((id) => id !== kb.id)))}
                            />
                            <span>{kb.name}</span>
                            <span className="text-stone-500">in {kb.workspace_name}, {kb.indexed_count} indexed</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                )}
              </div>
            ) : (
              <>
                {(scopeLabel || activeAgent) && (
                  <p className="text-xs text-stone-500">
                    {activeAgent ? `Agent: ${activeAgent.name}. ` : ""}{scopeLabel && !activeAgent ? `Searching ${scopeLabel}.` : ""}
                  </p>
                )}
                {messages.map((m, i) => (
                  <ChatMessageView
                    key={m.id}
                    message={m}
                    canRegenerate={i === lastIndex && m.role === "assistant" && !streaming && !!conversationId}
                    onOpenSource={setPreview}
                    onRegenerate={regenerate}
                  />
                ))}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-stone-200 p-3 dark:border-stone-800">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                maxLength={4000}
                aria-label="Your question"
                placeholder="Ask a question about your documents (Enter to send, Shift+Enter for a new line)"
                className="input max-h-40 resize-none"
              />
              {streaming ? (
                <button className="btn-secondary shrink-0" onClick={() => abortRef.current?.abort()} aria-label="Stop generating">
                  <Square size={16} /> Stop
                </button>
              ) : (
                <button className="btn-primary shrink-0" onClick={send} disabled={!input.trim()} aria-label="Send message">
                  <SendHorizontal size={16} /> Send
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {preview && <SourceModal source={preview} onClose={() => setPreview(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete conversation?"
          message={`“${deleting.title}” and its messages will be removed permanently.`}
          confirmLabel="Delete conversation"
          busy={removeConversation.isPending}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

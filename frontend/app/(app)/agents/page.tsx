"use client";

import Link from "next/link";
import { useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import { timeAgo } from "@/lib/format";
import { useAgents, useDeleteAgent, type Agent } from "@/lib/agents";
import { toast } from "@/store/toast";

export default function AgentsPage() {
  const { data, isLoading, isError, refetch } = useAgents();
  const remove = useDeleteAgent();
  const [deleting, setDeleting] = useState<Agent | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Agent deleted");
    } catch {
      toast.error("Could not delete the agent.");
    }
    setDeleting(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">Custom assistants with their own instructions, documents and tools. Pick one in Chat or Research.</p>
        </div>
        <Link href="/agents/new" className="btn-primary">New agent</Link>
      </div>

      {isError ? (
        <div className="panel flex items-center justify-between p-6 text-sm">
          <span>Could not load your agents.</span>
          <button className="btn-secondary" onClick={() => refetch()}>Try again</button>
        </div>
      ) : isLoading ? (
        <div className="panel space-y-3 p-5">{[0, 1].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />)}</div>
      ) : data && data.items.length > 0 ? (
        <ul className="panel divide-y divide-stone-200 dark:divide-stone-800">
          {data.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="min-w-0">
                <Link href={`/agents/${a.id}`} className="font-semibold hover:underline">{a.name}</Link>
                {a.description && <p className="mt-0.5 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{a.description}</p>}
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-stone-500">
                  <span>{a.model ?? "default model"}</span>
                  <span>{a.tools.length} {a.tools.length === 1 ? "tool" : "tools"}</span>
                  <span>{a.knowledge_base_ids.length ? `${a.knowledge_base_ids.length} knowledge ${a.knowledge_base_ids.length === 1 ? "base" : "bases"}` : "all knowledge bases"}</span>
                  {a.research_mode && <span className="text-teal-700 dark:text-teal-400">research enabled</span>}
                  <span>updated {timeAgo(a.updated_at)}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/chat?agent=${a.id}`} className="btn-secondary px-3 py-1.5">Chat</Link>
                {a.research_mode && <Link href={`/research?agent=${a.id}`} className="btn-secondary px-3 py-1.5">Research</Link>}
                <Link href={`/agents/${a.id}`} className="btn-secondary px-3 py-1.5">Edit</Link>
                <button className="btn-secondary px-3 py-1.5 text-rose-700 dark:text-rose-400" onClick={() => setDeleting(a)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel p-10 text-center text-sm">
          <p className="font-medium">No agents yet</p>
          <p className="mt-1 text-stone-600 dark:text-stone-400">Create one to give the assistant a focus: which documents it reads, how it answers and which tools it may use.</p>
          <Link href="/agents/new" className="btn-primary mt-4">Create your first agent</Link>
        </div>
      )}

      {deleting && (
        <ConfirmDialog title="Delete agent?" message={`“${deleting.name}” will be removed. Chats and research runs that used it keep working without it.`} confirmLabel="Delete agent" busy={remove.isPending} onConfirm={confirmDelete} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

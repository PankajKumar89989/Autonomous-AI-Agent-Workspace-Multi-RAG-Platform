"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import AgentForm from "@/components/AgentForm";
import { useAgent } from "@/lib/agents";

export default function EditAgentPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useAgent(id);

  if (isLoading) return <div className="h-8 w-64 animate-pulse rounded bg-stone-200 dark:bg-stone-800" role="status" aria-label="Loading agent" />;
  if (isError || !data) {
    return (
      <div className="panel p-10 text-center text-sm">
        <p className="font-medium">Agent not found</p>
        <p className="mt-1 text-stone-600 dark:text-stone-400">It may have been deleted, or it belongs to another account.</p>
        <Link href="/agents" className="btn-primary mt-4">Back to agents</Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/agents" className="text-sm text-stone-600 hover:underline dark:text-stone-400">Agents</Link>
          <h1 className="mt-1 text-2xl font-bold">{data.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/chat?agent=${data.id}`} className="btn-secondary">Chat with this agent</Link>
          {data.research_mode && <Link href={`/research?agent=${data.id}`} className="btn-secondary">Use in research</Link>}
        </div>
      </div>
      <AgentForm key={data.updated_at} agent={data} />
    </div>
  );
}

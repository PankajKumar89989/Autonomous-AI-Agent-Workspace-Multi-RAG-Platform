"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import ProviderNote from "@/components/ProviderNote";
import { ApiError } from "@/lib/api";
import { useAgents } from "@/lib/agents";
import { timeAgo } from "@/lib/format";
import { useAllKnowledgeBases } from "@/lib/knowledgeBases";
import { useDeleteRun, useRuns, useStartRun, type RunSummary } from "@/lib/research";
import { useHealth } from "@/lib/search";
import { toast } from "@/store/toast";

const LENGTHS = [
  { value: "short", label: "Short (about 150 words)" },
  { value: "medium", label: "Medium (about 400 words)" },
  { value: "detailed", label: "Detailed (about 900 words)" },
];

export default function ResearchWorkspace() {
  const router = useRouter();
  const kbs = useAllKnowledgeBases();
  const agents = useAgents();
  const health = useHealth();
  const runs = useRuns();
  const start = useStartRun();
  const removeRun = useDeleteRun();
  const [objective, setObjective] = useState("");
  const [scope, setScope] = useState<string[]>([]);
  const [useWeb, setUseWeb] = useState(false);
  const [length, setLength] = useState("");
  const [agentId, setAgentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RunSummary | null>(null);
  const researchAgents = (agents.data?.items ?? []).filter((a) => a.research_mode);
  const agent = researchAgents.find((a) => a.id === agentId);
  const webReady = health.data?.providers.web_search !== "none" && (!agent || agent.tools.includes("search_web"));

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("agent");
    if (fromUrl) setAgentId(fromUrl);
  }, []);
  const kbItems = kbs.data?.items ?? [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const run = await start.mutateAsync({
        objective: objective.trim(),
        knowledge_base_ids: agent || scope.length === 0 ? undefined : scope,
        use_web: useWeb && webReady,
        length: length || undefined,
        agent_id: agent?.id,
      });
      router.push(`/research/${run.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the research. Try again.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await removeRun.mutateAsync(deleting.id);
      toast.success("Run deleted");
    } catch {
      toast.error("Could not delete the run.");
    }
    setDeleting(null);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Research</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Give the agents an objective. They work in the background, so you can leave the page and come back to the finished, cited report.
          </p>
        </div>
        <Link href="/research/sources" className="btn-secondary">Source library</Link>
      </div>
      <ProviderNote />

      <form onSubmit={onSubmit} className="panel space-y-4 p-5">
        <label className="block space-y-1 text-sm font-medium">
          Objective
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Compare the battery storage technologies discussed in my reports and list the main opportunities."
            className="input"
          />
        </label>

        <label className="block space-y-1 text-sm font-medium">
          Agent
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="input">
            <option value="">No agent (default research team)</option>
            {researchAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <span className="block text-xs font-normal text-stone-500">
            Only agents with research mode turned on are listed. <Link href="/agents" className="underline">Manage agents</Link>
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Search in</legend>
            {agent ? (
              <p className="text-stone-600 dark:text-stone-400">
                {agent.tools.includes("search_documents") ? (agent.knowledge_base_ids.length ? `${agent.name} reads its ${agent.knowledge_base_ids.length} selected knowledge ${agent.knowledge_base_ids.length === 1 ? "base" : "bases"}.` : `${agent.name} reads all of your knowledge bases.`) : `${agent.name} does not read documents.`}
              </p>
            ) : kbItems.length === 0 && !kbs.isLoading ? (
              <p className="text-stone-600 dark:text-stone-400">
                No knowledge bases yet. <Link href="/knowledge-bases" className="text-teal-700 underline dark:text-teal-400">Create one</Link>, or use web research only.
              </p>
            ) : (
              <>
                <p className="text-stone-600 dark:text-stone-400">Leave unticked to search all of them.</p>
                <ul className="max-h-32 space-y-1 overflow-y-auto">
                  {kbItems.map((kb) => (
                    <li key={kb.id}>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={scope.includes(kb.id)} onChange={(e) => setScope((p) => (e.target.checked ? [...p, kb.id] : p.filter((i) => i !== kb.id)))} />
                        {kb.name} <span className="text-stone-500">({kb.indexed_count} indexed)</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </fieldset>

          <div className="space-y-3 text-sm">
            <label className="block space-y-1 font-medium">
              Report length
              <select value={length} onChange={(e) => setLength(e.target.value)} className="input">
                <option value="">{agent ? `Agent default (${agent.response_style})` : "Medium (about 400 words)"}</option>
                {LENGTHS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
            <label className={`flex items-start gap-2 ${webReady ? "cursor-pointer" : "opacity-60"}`}>
              <input type="checkbox" checked={useWeb && webReady} disabled={!webReady} onChange={(e) => setUseWeb(e.target.checked)} className="mt-1" />
              <span>
                <span className="font-medium">Include web research</span>
                <span className="block text-stone-600 dark:text-stone-400">
                  {webReady ? "Your objective is sent to the web search provider." : "Not configured. Set TAVILY_API_KEY in the backend .env to enable it."}
                </span>
              </span>
            </label>
          </div>
        </div>

        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={objective.trim().length < 5 || start.isPending}>
            {start.isPending ? "Starting..." : "Start research"}
          </button>
        </div>
      </form>

      <section aria-labelledby="history-heading" className="space-y-3">
        <h2 id="history-heading" className="text-lg font-semibold">Your runs</h2>
        {runs.data && runs.data.items.length > 0 ? (
          <ul className="panel divide-y divide-stone-200 dark:divide-stone-800">
            {runs.data.items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <Link href={`/research/${r.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate font-medium">{r.objective}</span>
                  <span className="text-stone-500">{r.status}, {timeAgo(r.created_at)}{r.agent_name ? `, agent ${r.agent_name}` : ""}</span>
                </Link>
                <button className="btn-secondary px-3 py-1.5 text-rose-700 dark:text-rose-400" onClick={() => setDeleting(r)}>Delete</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel p-6 text-center text-sm text-stone-600 dark:text-stone-400">No runs yet. Finished reports and their sources are kept here.</p>
        )}
      </section>

      {deleting && (
        <ConfirmDialog title="Delete run?" message="The report, its execution trace and its sources will be removed permanently." confirmLabel="Delete run" busy={removeRun.isPending} onConfirm={confirmDelete} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

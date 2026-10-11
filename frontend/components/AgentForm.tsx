"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiError } from "@/lib/api";
import { DEFAULT_AGENT, useAgentOptions, useCreateAgent, useUpdateAgent, type Agent, type AgentInput, type ResponseStyle } from "@/lib/agents";
import { useAllKnowledgeBases } from "@/lib/knowledgeBases";
import { toast } from "@/store/toast";

const STYLE_HELP: Record<ResponseStyle, string> = {
  concise: "Short answers, no preamble. Research reports come out about 150 words.",
  balanced: "Moderate length with the key details. Research reports about 400 words.",
  detailed: "Thorough, structured answers. Research reports about 900 words.",
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="panel space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-stone-600 dark:text-stone-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default function AgentForm({ agent }: { agent?: Agent }) {
  const router = useRouter();
  const options = useAgentOptions();
  const kbs = useAllKnowledgeBases();
  const create = useCreateAgent();
  const update = useUpdateAgent(agent?.id ?? "");
  const [form, setForm] = useState<AgentInput>(agent ? { ...agent } : DEFAULT_AGENT);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  const set = <K extends keyof AgentInput>(key: K, value: AgentInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: "tools" | "knowledge_base_ids", value: string, on: boolean) =>
    set(key, on ? [...form[key], value] : form[key].filter((v) => v !== value));
  const readsDocuments = form.tools.includes("search_documents") || form.tools.includes("analyze_csv");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload: AgentInput = { ...form, name: form.name.trim() };
      if (agent) await update.mutateAsync(payload);
      else await create.mutateAsync(payload);
      toast.success(agent ? "Agent saved" : "Agent created");
      router.push("/agents");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the agent. Try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Configuration" hint="Who this agent is and how it should answer.">
        <label className="block space-y-1 text-sm font-medium">
          Name
          <input value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={100} className="input" placeholder="Market analyst" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Description
          <input value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={500} className="input" placeholder="Compares the technology reports and flags opportunities" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Instructions
          <textarea value={form.instructions} onChange={(e) => set("instructions", e.target.value)} rows={6} maxLength={4000} className="input"
            placeholder={"Answer as a cautious analyst. Always mention figures with their units. Finish with one recommended next step."} />
          <span className="block text-xs font-normal text-stone-500">
            Added after the built-in rules, so an agent can change tone and format but always cites its sources and says when it can&apos;t find an answer. {form.instructions.length}/4000
          </span>
        </label>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Response style</legend>
          {(options.data?.styles ?? (["concise", "balanced", "detailed"] as ResponseStyle[])).map((style) => (
            <label key={style} className="flex cursor-pointer items-start gap-2">
              <input type="radio" name="style" checked={form.response_style === style} onChange={() => set("response_style", style)} className="mt-1" />
              <span><span className="font-medium capitalize">{style}</span><span className="block text-stone-600 dark:text-stone-400">{STYLE_HELP[style]}</span></span>
            </label>
          ))}
        </fieldset>
      </Section>

      <Section title="Model" hint="Which model answers, and how adventurous it is.">
        <label className="block space-y-1 text-sm font-medium">
          Model
          <select value={form.model ?? ""} onChange={(e) => set("model", e.target.value || null)} className="input">
            <option value="">Server default ({options.data?.default_model ?? "..."})</option>
            {options.data?.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Temperature: {form.temperature.toFixed(2)}
          <input type="range" min={0} max={1} step={0.05} value={form.temperature} onChange={(e) => set("temperature", Number(e.target.value))} className="w-full" />
          <span className="block text-xs font-normal text-stone-500">Lower is steadier and more literal. Higher is more varied. Grounded answers work best at 0.0 to 0.4.</span>
        </label>
      </Section>

      <Section title="Knowledge sources" hint="The documents this agent may read.">
        {!readsDocuments ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">This agent has no document tool turned on, so it will not read your documents.</p>
        ) : (kbs.data?.items.length ?? 0) === 0 && !kbs.isLoading ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            You have no knowledge bases yet. <Link href="/knowledge-bases" className="text-teal-700 underline dark:text-teal-400">Create one</Link> to give this agent something to read.
          </p>
        ) : (
          <>
            <p className="text-sm text-stone-600 dark:text-stone-400">Tick none to let it read all of your knowledge bases, or tick specific ones to limit it.</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {kbs.data?.items.map((kb) => (
                <li key={kb.id}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={form.knowledge_base_ids.includes(kb.id)} onChange={(e) => toggle("knowledge_base_ids", kb.id, e.target.checked)} />
                    {kb.name} <span className="text-stone-500">in {kb.workspace_name}, {kb.indexed_count} indexed</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="Tools" hint="What the agent can do besides reading documents.">
        <ul className="space-y-3 text-sm">
          {options.data?.tools.map((tool) => {
            const checked = form.tools.includes(tool.name);
            const blocked = !tool.available && !checked;
            return (
              <li key={tool.name}>
                <label className={`flex items-start gap-2 ${blocked ? "opacity-60" : "cursor-pointer"}`}>
                  <input type="checkbox" checked={checked} disabled={blocked} onChange={(e) => toggle("tools", tool.name, e.target.checked)} className="mt-1" />
                  <span>
                    <span className="font-medium">{tool.label}</span>
                    <span className="block text-stone-600 dark:text-stone-400">{tool.description}</span>
                    {!tool.available && <span className="block text-xs text-amber-800 dark:text-amber-300">{tool.unavailable_reason}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Execution settings">
        <label className="block space-y-1 text-sm font-medium">
          Maximum steps: {form.max_steps}
          <input type="range" min={1} max={8} step={1} value={form.max_steps} onChange={(e) => set("max_steps", Number(e.target.value))} className="w-full" />
          <span className="block text-xs font-normal text-stone-500">In chat: the most tool calls per answer. In research: how many research steps the planner may use.</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={form.research_mode} onChange={(e) => set("research_mode", e.target.checked)} className="mt-1" />
          <span>
            <span className="font-medium">Research mode</span>
            <span className="block text-stone-600 dark:text-stone-400">Let this agent be chosen for multi-agent research runs, using its knowledge bases, tools and instructions.</span>
          </span>
        </label>
      </Section>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <Link href="/agents" className="btn-secondary">Cancel</Link>
        <button type="submit" className="btn-primary" disabled={busy || !form.name.trim()}>{busy ? "Saving..." : agent ? "Save changes" : "Create agent"}</button>
      </div>
    </form>
  );
}

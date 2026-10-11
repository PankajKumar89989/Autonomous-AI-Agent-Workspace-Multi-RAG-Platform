"use client";

import { AlertCircle, CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";
import { useState } from "react";

import EvidenceModal from "@/components/EvidenceModal";
import Markdown from "@/components/Markdown";
import type { Evidence, RunStep, RunView as RunViewData, StepStatus } from "@/lib/research";

const AGENT_NAMES: Record<string, string> = {
  planner: "Planner",
  document: "Document agent",
  web: "Web research agent",
  analyst: "Analyst",
  summarizer: "Summarizer",
  citation: "Citation agent",
};

const ICONS: Record<StepStatus, React.ReactNode> = {
  pending: <Circle size={18} className="text-stone-400" />,
  running: <Loader2 size={18} className="animate-spin text-amber-600" />,
  completed: <CheckCircle2 size={18} className="text-teal-600" />,
  failed: <XCircle size={18} className="text-rose-600" />,
  skipped: <MinusCircle size={18} className="text-stone-400" />,
};

const STATUS_LABEL: Record<StepStatus, string> = { pending: "Waiting", running: "Running", completed: "Done", failed: "Failed", skipped: "Skipped" };

function Step({ step }: { step: RunStep }) {
  return (
    <li className="flex gap-3 p-4">
      <span className="mt-0.5 shrink-0" aria-label={STATUS_LABEL[step.status]}>{ICONS[step.status]}</span>
      <div className="min-w-0 text-sm">
        <p className="font-medium">
          {AGENT_NAMES[step.agent] ?? step.agent}
          <span className="ml-2 font-normal text-stone-500">{STATUS_LABEL[step.status]}</span>
          {step.fallback && <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-400">(used a simpler method)</span>}
        </p>
        <p className="text-stone-600 dark:text-stone-400">{step.task}</p>
        {step.summary && <p className="mt-1">{step.summary}</p>}
        {step.error && <p className="mt-1 text-rose-700 dark:text-rose-400">{step.error}</p>}
        {(step.attempts > 1 || step.duration_ms !== null) && (
          <p className="mt-1 text-xs text-stone-500">
            {step.duration_ms !== null ? `${(step.duration_ms / 1000).toFixed(1)}s` : ""}
            {step.attempts > 1 ? `${step.duration_ms !== null ? ", " : ""}${step.attempts} attempts` : ""}
          </p>
        )}
      </div>
    </li>
  );
}

export default function RunView({ run }: { run: RunViewData }) {
  const [open, setOpen] = useState<Evidence | null>(null);
  const sources = [...run.sources].sort((a, b) => Number(b.cited) - Number(a.cited) || a.n - b.n);
  const openSource = (n: number) => {
    const found = run.sources.find((s) => s.n === n);
    if (found) setOpen(found);
  };

  return (
    <div className="space-y-6">
      {run.status === "queued" && (
        <p role="status" className="rounded-lg bg-stone-100 px-4 py-3 text-sm dark:bg-stone-800">
          Queued. Waiting for a worker to pick this up. If it stays here, check that the worker is running (arq app.workers.tasks.WorkerSettings).
        </p>
      )}
      {run.steps.length > 0 && (
        <section aria-label="Agent progress">
          <h2 className="mb-2 text-lg font-semibold">Agent activity</h2>
          <ol className="panel divide-y divide-stone-200 dark:divide-stone-800">
            {run.steps.map((s) => <Step key={s.id} step={s} />)}
          </ol>
        </section>
      )}

      {run.status === "failed" && run.error && (
        <p role="alert" className="flex gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          <AlertCircle size={18} className="shrink-0" /> {run.error}
        </p>
      )}
      {run.status === "cancelled" && <p className="text-sm text-stone-500">This run was stopped before it finished.</p>}

      {run.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {run.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      {run.report && (
        <section aria-label="Report" className="panel p-5 text-sm">
          <Markdown text={run.report} onCite={openSource} />
        </section>
      )}

      {sources.length > 0 && (
        <section aria-label="Sources">
          <h2 className="mb-2 text-lg font-semibold">Sources found</h2>
          <ul className="panel divide-y divide-stone-200 dark:divide-stone-800">
            {sources.map((s) => (
              <li key={s.n}>
                <button onClick={() => setOpen(s)} className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <span className="min-w-0">
                    <span className="font-semibold">[{s.n}]</span> {s.title}
                    <span className="text-stone-500">{s.page_number ? `, page ${s.page_number}` : ""}{s.domain ? `, ${s.domain}` : ""}</span>
                  </span>
                  <span className="flex shrink-0 gap-2 text-xs">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 dark:bg-stone-800">{s.kind === "web" ? "Web" : "Document"}</span>
                    {run.status !== "running" && <span className={s.cited ? "text-teal-700 dark:text-teal-400" : "text-stone-500"}>{s.cited ? "Cited" : "Not cited"}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {open && <EvidenceModal source={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

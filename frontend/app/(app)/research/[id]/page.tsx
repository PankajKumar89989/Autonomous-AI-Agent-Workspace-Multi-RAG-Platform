"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import RunView from "@/components/RunView";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  downloadExport, emptyRun, fromDetail, isActive, reduceEvent, useCancelRun, useDeleteRun, useRerun, useRun,
  type RunView as RunViewData,
} from "@/lib/research";
import { streamEvents } from "@/lib/sse";
import { toast } from "@/store/toast";

export default function ResearchRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useRun(id);
  const cancel = useCancelRun(id);
  const rerun = useRerun();
  const remove = useDeleteRun();
  const [live, setLive] = useState<RunViewData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const active = isActive(data?.status);
  const objective = data?.objective;

  // While the run is active, replay and follow its event log. The worker keeps going if this page is closed.
  useEffect(() => {
    if (!active || !objective) {
      setLive(null);
      return;
    }
    const controller = new AbortController();
    setLive(emptyRun(objective, "queued"));
    streamEvents(`/research/${id}/events`, {}, controller.signal, (event, payload) => setLive((p) => (p ? reduceEvent(p, event, payload) : p)))
      .catch(() => undefined) // polling in useRun covers a dropped connection
      .finally(() => {
        if (!controller.signal.aborted) void qc.invalidateQueries({ queryKey: ["agent-run", id] });
      });
    return () => controller.abort();
  }, [active, objective, id, qc]);

  async function onExport(format: "markdown" | "pdf") {
    setExporting(format);
    try {
      await downloadExport(id, format);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not export the report.");
    } finally {
      setExporting(null);
    }
  }

  async function onRerun() {
    try {
      const run = await rerun.mutateAsync(id);
      router.push(`/research/${run.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start the run again.");
    }
  }

  async function onDelete() {
    try {
      await remove.mutateAsync(id);
      toast.success("Run deleted");
      router.replace("/research");
    } catch {
      toast.error("Could not delete the run.");
      setConfirming(false);
    }
  }

  if (isLoading) return <div className="h-8 w-64 animate-pulse rounded bg-stone-200 dark:bg-stone-800" role="status" aria-label="Loading run" />;
  if (isError || !data) {
    return (
      <div className="panel p-10 text-center text-sm">
        <p className="font-medium">Run not found</p>
        <p className="mt-1 text-stone-600 dark:text-stone-400">It may have been deleted, or it belongs to another account.</p>
        <Link href="/research" className="btn-primary mt-4">Back to research</Link>
      </div>
    );
  }

  const view = live ?? fromDetail(data);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/research" className="text-sm text-stone-600 hover:underline dark:text-stone-400">Research</Link>
          <h1 className="mt-1 break-words text-2xl font-bold">{data.objective}</h1>
          <p className="mt-1 text-sm text-stone-500">
            {view.status}, started {formatDate(data.created_at)}
            {data.duration_ms ? `, took ${(data.duration_ms / 1000).toFixed(1)}s` : ""}
            {data.options.use_web ? ", with web research" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && (
            <button className="btn-secondary" disabled={cancel.isPending || data.cancel_requested} onClick={() => cancel.mutate()}>
              {data.cancel_requested ? "Stopping..." : "Cancel run"}
            </button>
          )}
          {data.status === "completed" && (
            <>
              <button className="btn-secondary" disabled={exporting !== null} onClick={() => onExport("markdown")}>{exporting === "markdown" ? "Preparing..." : "Export Markdown"}</button>
              <button className="btn-secondary" disabled={exporting !== null} onClick={() => onExport("pdf")}>{exporting === "pdf" ? "Preparing..." : "Export PDF"}</button>
            </>
          )}
          {!active && <button className="btn-secondary" disabled={rerun.isPending} onClick={onRerun}>Run again</button>}
          {!active && <button className="btn-secondary text-rose-700 dark:text-rose-400" onClick={() => setConfirming(true)}>Delete</button>}
        </div>
      </div>

      <RunView run={view} />

      {confirming && (
        <ConfirmDialog title="Delete run?" message="The report, its execution trace and its sources will be removed permanently." confirmLabel="Delete run" busy={remove.isPending} onConfirm={onDelete} onClose={() => setConfirming(false)} />
      )}
    </div>
  );
}

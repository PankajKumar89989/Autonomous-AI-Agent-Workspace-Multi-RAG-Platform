"use client";

import { Copy, RefreshCw } from "lucide-react";

import Markdown from "@/components/Markdown";
import type { LocalMessage, Source, Stage } from "@/lib/chat";
import { toast } from "@/store/toast";

const STAGE_LABEL: Record<Stage, string> = {
  retrieving: "Searching your documents...",
  tools: "Using tools...",
  reranking: "Ranking the best passages...",
  generating: "Writing the answer...",
};

type Props = {
  message: LocalMessage;
  canRegenerate: boolean;
  onOpenSource: (source: Source) => void;
  onRegenerate: () => void;
};

export default function ChatMessageView({ message, canRegenerate, onOpenSource, onRegenerate }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-teal-700 px-4 py-2.5 text-sm text-white dark:bg-teal-600">
          {message.content}
        </p>
      </div>
    );
  }

  const streaming = message.status === "streaming";
  const sources = [...(message.sources ?? [])].sort((a, b) => Number(b.cited) - Number(a.cited) || a.n - b.n);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Answer copied");
    } catch {
      toast.error("Could not copy. Select the text manually.");
    }
  }

  return (
    <div className="max-w-[95%]">
      <div className="panel px-4 py-3 text-sm">
        {streaming && message.stage && (
          <p className="mb-2 text-xs text-stone-500" role="status">{STAGE_LABEL[message.stage]}</p>
        )}
        {message.content ? (
          <Markdown text={message.content} onCite={(n) => { const s = message.sources?.find((x) => x.n === n); if (s) onOpenSource(s); }} />
        ) : (
          !streaming && <p className="text-stone-500">No answer was produced.</p>
        )}
        {message.status === "stopped" && <p className="mt-2 text-xs text-stone-500">Stopped before finishing.</p>}
        {message.status === "failed" && (
          <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {message.error_message ?? "Something went wrong."}
          </p>
        )}
        {message.warnings && message.warnings.length > 0 && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{message.warnings.join(" ")}</p>
        )}
      </div>

      {sources.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs font-medium text-stone-500">Sources</p>
          <ul className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <li key={s.n}>
                <button
                  type="button"
                  onClick={() => onOpenSource(s)}
                  className={`rounded-lg border px-2.5 py-1 text-left text-xs hover:bg-stone-100 dark:hover:bg-stone-800 ${
                    s.cited ? "border-teal-300 dark:border-teal-800" : "border-stone-200 text-stone-500 dark:border-stone-800"
                  }`}
                >
                  <span className="font-semibold">[{s.n}]</span> {s.document_name}
                  {s.page_number ? `, page ${s.page_number}` : ""}
                  {s.domain ? `, ${s.domain}` : ""}
                  {s.cited ? "" : " (retrieved, not cited)"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!streaming && message.content && (
        <div className="mt-1 flex gap-1">
          <button onClick={copy} aria-label="Copy answer" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800">
            <Copy size={14} /> Copy
          </button>
          {canRegenerate && (
            <button onClick={onRegenerate} aria-label="Regenerate answer" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800">
              <RefreshCw size={14} /> Regenerate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

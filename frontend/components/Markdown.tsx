"use client";

import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders model output as Markdown (raw HTML is never rendered) and turns [n] markers into source buttons. */
export default function Markdown({ text, onCite }: { text: string; onCite?: (n: number) => void }) {
  const prepared = useMemo(() => text.replace(/\[(\d{1,2})\](?!\()/g, "[$1](#source-$1)"), [text]);

  const components: Components = {
    a: ({ href, children }) => {
      const cite = href?.match(/^#source-(\d+)$/);
      if (cite) {
        return (
          <button
            type="button"
            onClick={() => onCite?.(Number(cite[1]))}
            aria-label={`Open source ${cite[1]}`}
            className="mx-0.5 rounded bg-teal-100 px-1.5 py-0.5 align-baseline text-xs font-semibold text-teal-800 hover:bg-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:hover:bg-teal-900"
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline dark:text-teal-400">
          {children}
        </a>
      );
    },
    p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
    h1: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-bold">{children}</h3>,
    h2: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold">{children}</h3>,
    h3: ({ children }) => <h4 className="mb-1 mt-3 font-semibold">{children}</h4>,
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-4 border-stone-300 pl-3 text-stone-600 dark:border-stone-700 dark:text-stone-400">{children}</blockquote>
    ),
    code: ({ children }) => (
      <code className="rounded bg-stone-100 px-1 py-0.5 text-[0.85em] dark:bg-stone-800">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="my-3 overflow-x-auto rounded-lg bg-stone-100 p-3 text-sm dark:bg-stone-950 [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border border-stone-300 px-3 py-1.5 text-left font-semibold dark:border-stone-700">{children}</th>,
    td: ({ children }) => <td className="border border-stone-300 px-3 py-1.5 dark:border-stone-700">{children}</td>,
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {prepared}
    </ReactMarkdown>
  );
}

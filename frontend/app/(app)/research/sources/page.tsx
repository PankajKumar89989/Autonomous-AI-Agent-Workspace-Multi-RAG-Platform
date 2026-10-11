"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatDate } from "@/lib/format";
import { useSourceLibrary } from "@/lib/research";

const KINDS = [
  { value: "", label: "All sources" },
  { value: "web", label: "Web pages" },
  { value: "document", label: "Document passages" },
];

export default function SourceLibraryPage() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useSourceLibrary({ kind, q, page });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/research" className="text-sm text-stone-600 hover:underline dark:text-stone-400">Research</Link>
        <h1 className="mt-1 text-2xl font-bold">Source library</h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">Every source your research runs have found, with where and when it was retrieved.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden />
          <input type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search title, site or address" aria-label="Search sources" className="input pl-9" />
        </div>
        <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} aria-label="Source type" className="input w-auto">
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>

      {isError ? (
        <div className="panel flex items-center justify-between p-6 text-sm">
          <span>Could not load the source library.</span>
          <button className="btn-secondary" onClick={() => refetch()}>Try again</button>
        </div>
      ) : isLoading ? (
        <div className="panel space-y-3 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />)}</div>
      ) : data && data.items.length > 0 ? (
        <>
          <ul className="panel divide-y divide-stone-200 dark:divide-stone-800">
            {data.items.map((s) => (
              <li key={s.id} className="space-y-1 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 font-medium">
                    {s.kind === "web" && s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline dark:text-teal-400">{s.title}</a>
                    ) : (
                      s.title
                    )}
                    {s.page_number ? <span className="font-normal text-stone-500">, page {s.page_number}</span> : null}
                  </p>
                  <span className="flex gap-2 text-xs">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 dark:bg-stone-800">{s.kind === "web" ? "Web" : "Document"}</span>
                    <span className={s.cited ? "text-teal-700 dark:text-teal-400" : "text-stone-500"}>{s.cited ? "Cited in report" : "Not cited"}</span>
                  </span>
                </div>
                <p className="text-stone-600 dark:text-stone-400">
                  {s.domain ? `${s.domain}, ` : ""}
                  {s.retrieved_at ? `retrieved ${s.retrieved_at}` : `found ${formatDate(s.created_at)}`}
                </p>
                <p className="text-stone-500">
                  Found while researching{" "}
                  <Link href={`/research/${s.run_id}`} className="underline">{s.run_objective.length > 80 ? `${s.run_objective.slice(0, 77)}...` : s.run_objective}</Link>
                  {s.kind === "document" && s.knowledge_base_id && (
                    <>, in <Link href={`/knowledge-bases/${s.knowledge_base_id}`} className="underline">its knowledge base</Link></>
                  )}
                </p>
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="text-stone-600 dark:text-stone-400">Page {page} of {totalPages}</span>
              <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      ) : (
        <div className="panel p-10 text-center text-sm">
          <p className="font-medium">{q || kind ? "No sources match" : "No sources yet"}</p>
          <p className="mt-1 text-stone-600 dark:text-stone-400">{q || kind ? "Try a different search or filter." : "Sources appear here after your first research run."}</p>
        </div>
      )}
    </div>
  );
}

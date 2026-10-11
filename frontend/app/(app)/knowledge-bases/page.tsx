"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import KnowledgeBaseFormModal from "@/components/KnowledgeBaseFormModal";
import { timeAgo } from "@/lib/format";
import { useKnowledgeBases } from "@/lib/knowledgeBases";

export default function KnowledgeBasesPage() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError, refetch } = useKnowledgeBases({ q, page });

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Knowledge bases</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>New knowledge base</button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden />
        <input type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search by name" aria-label="Search knowledge bases" className="input pl-9" />
      </div>

      {isError ? (
        <div className="panel flex items-center justify-between p-6 text-sm">
          <span>Could not load knowledge bases.</span>
          <button className="btn-secondary" onClick={() => refetch()}>Try again</button>
        </div>
      ) : isLoading ? (
        <div className="panel divide-y divide-stone-200 dark:divide-stone-800">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 p-5">
              <div className="h-5 w-48 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
              <div className="h-4 w-72 max-w-full animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
            </div>
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <ul className="panel divide-y divide-stone-200 dark:divide-stone-800">
            {data.items.map((kb) => (
              <li key={kb.id}>
                <Link href={`/knowledge-bases/${kb.id}`} className="flex flex-wrap items-start justify-between gap-3 p-5 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <div className="min-w-0">
                    <p className="font-semibold">{kb.name}</p>
                    <p className="text-sm text-stone-600 dark:text-stone-400">In {kb.workspace_name}</p>
                    {kb.description && <p className="mt-1 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{kb.description}</p>}
                  </div>
                  <div className="text-right text-sm text-stone-500">
                    <p>{kb.document_count} {kb.document_count === 1 ? "document" : "documents"}, {kb.indexed_count} indexed</p>
                    <p>Updated {timeAgo(kb.updated_at)}</p>
                  </div>
                </Link>
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
          <p className="font-medium">{q ? `No knowledge bases match “${q}”` : "No knowledge bases yet"}</p>
          <p className="mt-1 text-stone-600 dark:text-stone-400">
            {q ? "Try a different name." : "A knowledge base holds the documents your agents can read and cite."}
          </p>
          {!q && <button className="btn-primary mt-4" onClick={() => setCreating(true)}>Create your first knowledge base</button>}
        </div>
      )}

      {creating && <KnowledgeBaseFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}

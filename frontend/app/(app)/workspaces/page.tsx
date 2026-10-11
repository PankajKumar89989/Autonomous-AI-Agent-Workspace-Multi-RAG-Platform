"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import WorkspaceFormModal from "@/components/WorkspaceFormModal";
import { timeAgo } from "@/lib/format";
import { useWorkspaces } from "@/lib/workspaces";

export default function WorkspacesPage() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError, refetch } = useWorkspaces(q, page);

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
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>New workspace</button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden />
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by name"
          aria-label="Search workspaces"
          className="input pl-9"
        />
      </div>

      {isError ? (
        <div className="panel flex items-center justify-between p-6 text-sm">
          <span>Could not load workspaces.</span>
          <button className="btn-secondary" onClick={() => refetch()}>Try again</button>
        </div>
      ) : isLoading ? (
        <div className="panel divide-y divide-stone-200 dark:divide-stone-800">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 p-5">
              <div className="h-5 w-48 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
              <div className="h-4 w-80 max-w-full animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
            </div>
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <ul className="panel divide-y divide-stone-200 dark:divide-stone-800">
            {data.items.map((w) => (
              <li key={w.id}>
                <Link href={`/workspaces/${w.id}`} className="flex items-start justify-between gap-4 p-5 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <div className="min-w-0">
                    <p className="font-semibold">{w.name}</p>
                    {w.description && <p className="mt-1 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{w.description}</p>}
                  </div>
                  <span className="shrink-0 text-sm text-stone-500">Updated {timeAgo(w.updated_at)}</span>
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
          <p className="font-medium">{q ? `No workspaces match “${q}”` : "No workspaces yet"}</p>
          <p className="mt-1 text-stone-600 dark:text-stone-400">
            {q ? "Try a different name." : "A workspace groups the documents, agents and research for one project."}
          </p>
          {!q && <button className="btn-primary mt-4" onClick={() => setCreating(true)}>Create your first workspace</button>}
        </div>
      )}

      {creating && <WorkspaceFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}

"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { ApiError } from "@/lib/api";
import { useSearch } from "@/lib/search";

const SOURCE_LABEL = { vector: "Found by meaning", keyword: "Found by keywords" } as const;

export default function SearchPanel({ knowledgeBaseId, hasIndexedDocuments }: { knowledgeBaseId: string; hasIndexedDocuments: boolean }) {
  const search = useSearch();
  const [query, setQuery] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (query.trim()) search.mutate({ query: query.trim(), knowledge_base_ids: [knowledgeBaseId] });
  }

  const data = search.data;

  return (
    <section aria-labelledby="search-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="search-heading" className="text-lg font-semibold">Search this knowledge base</h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Ask in plain words. Results combine meaning-based and keyword matching, and show where each passage came from.
        </p>
      </div>
        <Link href={`/chat?kb=${knowledgeBaseId}`} className="btn-secondary">Chat with this knowledge base</Link>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={1000}
          aria-label="Search query"
          placeholder="What do the reports say about battery storage?"
          className="input"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={search.isPending || !query.trim()}>
          {search.isPending ? "Searching..." : "Search"}
        </button>
      </form>

      {search.isError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {search.error instanceof ApiError ? search.error.message : "Search failed. Try again."}
        </p>
      )}

      {data && (
        <div className="space-y-3">
          {data.warnings.map((w) => (
            <p key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{w}</p>
          ))}
          {data.results.length === 0 ? (
            <div className="panel p-6 text-center text-sm">
              <p className="font-medium">No matching passages</p>
              <p className="mt-1 text-stone-600 dark:text-stone-400">
                {hasIndexedDocuments
                  ? "Try different words. Only passages above the similarity threshold are returned."
                  : "No documents are indexed yet. Wait for uploads to show Indexed."}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-stone-500">{data.results.length} passages in {data.took_ms} ms</p>
              <ul className="space-y-3">
                {data.results.map((hit, i) => (
                  <li key={hit.chunk_id} className="panel p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <p className="font-medium">
                        {i + 1}. {hit.document_name}
                        {hit.page_number ? <span className="font-normal text-stone-500">, page {hit.page_number}</span> : null}
                      </p>
                      <p className="text-stone-500">Relevance {Math.round(hit.score * 100)}%</p>
                    </div>
                    <p className="line-clamp-5 whitespace-pre-wrap text-sm">{hit.content}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {hit.sources.map((s) => (
                        <span key={s} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                          {SOURCE_LABEL[s]}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

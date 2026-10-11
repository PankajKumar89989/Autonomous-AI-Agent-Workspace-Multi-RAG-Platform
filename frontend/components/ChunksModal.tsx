"use client";

import { useState } from "react";

import Modal from "@/components/Modal";
import { useChunks, type DocumentRecord } from "@/lib/documents";

export default function ChunksModal({ document, onClose }: { document: DocumentRecord; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useChunks(document.id, page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <Modal title={`Chunks in ${document.filename}`} onClose={onClose} size="lg">
      {isLoading ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">Loading chunks...</p>
      ) : isError || !data ? (
        <p className="text-sm text-rose-700 dark:text-rose-400">Could not load the chunks.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-stone-600 dark:text-stone-400">{data.total} chunks in total.</p>
          <ul className="space-y-3">
            {data.items.map((c) => (
              <li key={c.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                <p className="mb-1 text-xs text-stone-500">
                  Chunk {c.chunk_index + 1}
                  {c.page_number ? `, page ${c.page_number}` : ""}, about {c.token_count} tokens
                </p>
                <p className="line-clamp-6 whitespace-pre-wrap text-sm">{c.content}</p>
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
        </div>
      )}
    </Modal>
  );
}

"use client";

import Link from "next/link";

import Modal from "@/components/Modal";
import type { Source } from "@/lib/chat";

export default function SourceModal({ source, onClose }: { source: Source; onClose: () => void }) {
  return (
    <Modal title={`Source [${source.n}]`} onClose={onClose} size="lg">
      <div className="space-y-3 text-sm">
        <p className="font-medium">
          {source.document_name}
          {source.page_number ? <span className="font-normal text-stone-500">, page {source.page_number}</span> : null}
          {source.chunk_index !== null ? <span className="font-normal text-stone-500">, chunk {source.chunk_index + 1}</span> : null}
          <span className="ml-2 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-normal dark:bg-stone-800">
            {source.kind === "web" ? "Web" : source.kind === "tool" ? "Tool result" : "Your document"}
          </span>
        </p>
        {source.kind === "web" && source.url && (
          <p>
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-teal-700 underline dark:text-teal-400">{source.url}</a>
          </p>
        )}
        <p className="whitespace-pre-wrap rounded-lg bg-stone-100 p-3 dark:bg-stone-950">{source.content}</p>
        {source.knowledge_base_id && (
          <Link href={`/knowledge-bases/${source.knowledge_base_id}`} className="btn-secondary">Open knowledge base</Link>
        )}
      </div>
    </Modal>
  );
}

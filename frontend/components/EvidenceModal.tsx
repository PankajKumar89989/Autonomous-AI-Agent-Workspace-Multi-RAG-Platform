"use client";

import Link from "next/link";

import Modal from "@/components/Modal";
import type { Evidence } from "@/lib/research";

export default function EvidenceModal({ source, onClose }: { source: Evidence; onClose: () => void }) {
  return (
    <Modal title={`Source [${source.n}]`} onClose={onClose} size="lg">
      <div className="space-y-3 text-sm">
        <p>
          <span className="mr-2 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs dark:bg-stone-800">
            {source.kind === "web" ? "Web" : "Your document"}
          </span>
          <span className="font-medium">{source.title}</span>
          {source.page_number ? <span className="text-stone-500">, page {source.page_number}</span> : null}
        </p>
        {source.kind === "web" && source.url && (
          <p className="text-stone-600 dark:text-stone-400">
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-teal-700 underline dark:text-teal-400">
              {source.url}
            </a>
            {source.retrieved_at ? `, retrieved ${source.retrieved_at}` : ""}
          </p>
        )}
        <p className="whitespace-pre-wrap rounded-lg bg-stone-100 p-3 dark:bg-stone-950">{source.content}</p>
        {source.kind === "document" && source.knowledge_base_id && (
          <Link href={`/knowledge-bases/${source.knowledge_base_id}`} className="btn-secondary">Open knowledge base</Link>
        )}
      </div>
    </Modal>
  );
}

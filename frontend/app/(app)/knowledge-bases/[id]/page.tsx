"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ChunksModal from "@/components/ChunksModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import KnowledgeBaseFormModal from "@/components/KnowledgeBaseFormModal";
import ProviderNote from "@/components/ProviderNote";
import SearchPanel from "@/components/SearchPanel";
import StatusBadge from "@/components/StatusBadge";
import UploadDropzone from "@/components/UploadDropzone";
import { ApiError } from "@/lib/api";
import { useDeleteDocument, useDocuments, useReindexDocument, type DocumentRecord } from "@/lib/documents";
import { formatBytes, formatDate, timeAgo } from "@/lib/format";
import { useDeleteKnowledgeBase, useKnowledgeBase } from "@/lib/knowledgeBases";
import { toast } from "@/store/toast";

export default function KnowledgeBasePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const kbQuery = useKnowledgeBase(id);
  const removeKb = useDeleteKnowledgeBase();
  const removeDoc = useDeleteDocument(id);
  const reindex = useReindexDocument(id);

  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [deletingKb, setDeletingKb] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<DocumentRecord | null>(null);
  const [viewing, setViewing] = useState<DocumentRecord | null>(null);
  const docs = useDocuments(id, q, page);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  // Keep the header counts in step with document status changes picked up by polling.
  const signature = docs.data?.items.map((d) => `${d.id}:${d.status}`).join(",") ?? "";
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: ["knowledge-base", id] });
  }, [signature, id, qc]);

  async function onReindex(doc: DocumentRecord) {
    try {
      await reindex.mutateAsync(doc.id);
      toast.success(`Reindexing ${doc.filename}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reindex the document.");
    }
  }

  async function onDeleteDoc() {
    if (!deletingDoc) return;
    try {
      await removeDoc.mutateAsync(deletingDoc.id);
      toast.success("Document deleted");
    } catch {
      toast.error("Could not delete the document. Try again.");
    }
    setDeletingDoc(null);
  }

  async function onDeleteKb() {
    try {
      await removeKb.mutateAsync(id);
      toast.success("Knowledge base deleted");
      router.replace("/knowledge-bases");
    } catch {
      toast.error("Could not delete the knowledge base. Try again.");
      setDeletingKb(false);
    }
  }

  if (kbQuery.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading knowledge base">
        <div className="h-8 w-64 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
      </div>
    );
  }
  const kb = kbQuery.data;
  if (kbQuery.isError || !kb) {
    return (
      <div className="panel p-10 text-center text-sm">
        <p className="font-medium">Knowledge base not found</p>
        <p className="mt-1 text-stone-600 dark:text-stone-400">It may have been deleted, or it belongs to another account.</p>
        <Link href="/knowledge-bases" className="btn-primary mt-4">Back to knowledge bases</Link>
      </div>
    );
  }

  const totalPages = docs.data ? Math.max(1, Math.ceil(docs.data.total / docs.data.page_size)) : 1;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/workspaces/${kb.workspace_id}`} className="text-sm text-stone-600 hover:underline dark:text-stone-400">
            {kb.workspace_name}
          </Link>
          <h1 className="mt-1 break-words text-2xl font-bold">{kb.name}</h1>
          {kb.description && <p className="mt-2 max-w-prose text-stone-600 dark:text-stone-400">{kb.description}</p>}
          <p className="mt-2 text-sm text-stone-500">
            {kb.document_count} {kb.document_count === 1 ? "document" : "documents"}, {kb.indexed_count} indexed. Chunks of up to {kb.chunk_size} tokens with {kb.chunk_overlap} overlap. Created {formatDate(kb.created_at)}.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn-secondary text-rose-700 dark:text-rose-400" onClick={() => setDeletingKb(true)}>Delete</button>
        </div>
      </div>

      <ProviderNote />

      <UploadDropzone knowledgeBaseId={id} />

      <section aria-labelledby="docs-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="docs-heading" className="text-lg font-semibold">Documents</h2>
          <div className="relative w-full max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden />
            <input type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search by file name" aria-label="Search documents" className="input pl-9" />
          </div>
        </div>

        {docs.isError ? (
          <div className="panel flex items-center justify-between p-6 text-sm">
            <span>Could not load documents.</span>
            <button className="btn-secondary" onClick={() => docs.refetch()}>Try again</button>
          </div>
        ) : docs.isLoading ? (
          <div className="panel space-y-3 p-5">
            {[0, 1].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
            ))}
          </div>
        ) : docs.data && docs.data.items.length > 0 ? (
          <>
            <ul className="panel divide-y divide-stone-200 dark:divide-stone-800">
              {docs.data.items.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.filename}</p>
                    <p className="text-sm text-stone-600 dark:text-stone-400">
                      {d.source_type.toUpperCase()}, {formatBytes(d.size_bytes)}
                      {d.page_count ? `, ${d.page_count} pages` : ""}
                      {d.status === "completed" ? `, ${d.chunk_count} chunks` : ""}, added {timeAgo(d.created_at)}
                    </p>
                    {d.status === "failed" && d.error_message && (
                      <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">{d.error_message}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={d.status} />
                    {d.status === "completed" && (
                      <button className="btn-secondary px-3 py-1.5" onClick={() => setViewing(d)}>Chunks</button>
                    )}
                    {(d.status === "completed" || d.status === "failed") && (
                      <button className="btn-secondary px-3 py-1.5" onClick={() => onReindex(d)}>Reindex</button>
                    )}
                    <button className="btn-secondary px-3 py-1.5 text-rose-700 dark:text-rose-400" onClick={() => setDeletingDoc(d)}>Delete</button>
                  </div>
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
          <div className="panel p-8 text-center text-sm">
            <p className="font-medium">{q ? `No documents match “${q}”` : "No documents yet"}</p>
            <p className="mt-1 text-stone-600 dark:text-stone-400">
              {q ? "Try a different file name." : "Upload a file above to start building this knowledge base."}
            </p>
          </div>
        )}
      </section>

      <SearchPanel knowledgeBaseId={id} hasIndexedDocuments={kb.indexed_count > 0} />

      {editing && <KnowledgeBaseFormModal knowledgeBase={kb} onClose={() => setEditing(false)} />}
      {viewing && <ChunksModal document={viewing} onClose={() => setViewing(null)} />}
      {deletingDoc && (
        <ConfirmDialog
          title="Delete document?"
          message={`“${deletingDoc.filename}” and its chunks will be removed permanently.`}
          confirmLabel="Delete document"
          busy={removeDoc.isPending}
          onConfirm={onDeleteDoc}
          onClose={() => setDeletingDoc(null)}
        />
      )}
      {deletingKb && (
        <ConfirmDialog
          title="Delete knowledge base?"
          message={`“${kb.name}” and all ${kb.document_count} of its documents will be removed permanently.`}
          confirmLabel="Delete knowledge base"
          busy={removeKb.isPending}
          onConfirm={onDeleteKb}
          onClose={() => setDeletingKb(false)}
        />
      )}
    </div>
  );
}

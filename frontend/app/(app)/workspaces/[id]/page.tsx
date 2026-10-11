"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import KnowledgeBaseFormModal from "@/components/KnowledgeBaseFormModal";
import WorkspaceFormModal from "@/components/WorkspaceFormModal";
import { formatDate } from "@/lib/format";
import { useKnowledgeBases } from "@/lib/knowledgeBases";
import { useDeleteWorkspace, useWorkspace } from "@/lib/workspaces";
import { toast } from "@/store/toast";

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: workspace, isLoading, isError } = useWorkspace(id);
  const kbs = useKnowledgeBases({ workspaceId: id });
  const remove = useDeleteWorkspace();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [creatingKb, setCreatingKb] = useState(false);

  async function onDelete() {
    try {
      await remove.mutateAsync(id);
      toast.success("Workspace deleted");
      router.replace("/workspaces");
    } catch {
      toast.error("Could not delete the workspace. Try again.");
      setConfirming(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading workspace">
        <div className="h-8 w-64 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
      </div>
    );
  }

  if (isError || !workspace) {
    return (
      <div className="panel p-10 text-center text-sm">
        <p className="font-medium">Workspace not found</p>
        <p className="mt-1 text-stone-600 dark:text-stone-400">It may have been deleted, or it belongs to another account.</p>
        <Link href="/workspaces" className="btn-primary mt-4">Back to workspaces</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/workspaces" className="text-sm text-stone-600 hover:underline dark:text-stone-400">Workspaces</Link>
          <h1 className="mt-1 break-words text-2xl font-bold">{workspace.name}</h1>
          {workspace.description && <p className="mt-2 max-w-prose text-stone-600 dark:text-stone-400">{workspace.description}</p>}
          <p className="mt-2 text-sm text-stone-500">Created {formatDate(workspace.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn-secondary text-rose-700 dark:text-rose-400" onClick={() => setConfirming(true)}>Delete</button>
        </div>
      </div>

      <section aria-labelledby="kb-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="kb-heading" className="text-lg font-semibold">Knowledge bases</h2>
          <button className="btn-primary" onClick={() => setCreatingKb(true)}>New knowledge base</button>
        </div>
        {kbs.isLoading ? (
          <div className="panel h-16 animate-pulse" />
        ) : kbs.data && kbs.data.items.length > 0 ? (
          <ul className="panel divide-y divide-stone-200 dark:divide-stone-800">
            {kbs.data.items.map((kb) => (
              <li key={kb.id}>
                <Link href={`/knowledge-bases/${kb.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <span className="font-medium">{kb.name}</span>
                  <span className="text-sm text-stone-500">{kb.document_count} {kb.document_count === 1 ? "document" : "documents"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="panel p-8 text-center text-sm">
            <p className="font-medium">No knowledge bases in this workspace</p>
            <p className="mt-1 text-stone-600 dark:text-stone-400">Create one, then upload the documents you want to ask questions about.</p>
          </div>
        )}
      </section>

      {editing && <WorkspaceFormModal workspace={workspace} onClose={() => setEditing(false)} />}
      {creatingKb && <KnowledgeBaseFormModal workspaceId={id} onClose={() => setCreatingKb(false)} />}
      {confirming && (
        <ConfirmDialog
          title="Delete workspace?"
          message={`“${workspace.name}” and every knowledge base and document inside it will be removed permanently.`}
          confirmLabel="Delete workspace"
          busy={remove.isPending}
          onConfirm={onDelete}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

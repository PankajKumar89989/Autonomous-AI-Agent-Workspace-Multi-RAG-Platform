"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import Modal from "@/components/Modal";
import { ApiError } from "@/lib/api";
import { useCreateKnowledgeBase, useUpdateKnowledgeBase, type KnowledgeBase } from "@/lib/knowledgeBases";
import { useAllWorkspaces } from "@/lib/workspaces";
import { toast } from "@/store/toast";

type Props = { workspaceId?: string; knowledgeBase?: KnowledgeBase; onClose: () => void };

export default function KnowledgeBaseFormModal({ workspaceId, knowledgeBase, onClose }: Props) {
  const router = useRouter();
  const create = useCreateKnowledgeBase();
  const update = useUpdateKnowledgeBase(knowledgeBase?.id ?? "");
  const needsPicker = !workspaceId && !knowledgeBase;
  const workspaces = useAllWorkspaces();
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  const noWorkspaces = needsPicker && workspaces.data?.items.length === 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = {
      name: String(form.get("name")).trim(),
      description: String(form.get("description")).trim(),
      chunk_size: Number(form.get("chunk_size")),
      chunk_overlap: Number(form.get("chunk_overlap")),
    };
    setError(null);
    try {
      if (knowledgeBase) {
        await update.mutateAsync(input);
        toast.success("Knowledge base saved");
        onClose();
      } else {
        const created = await create.mutateAsync({ ...input, workspace_id: workspaceId ?? String(form.get("workspace_id")) });
        toast.success("Knowledge base created");
        router.push(`/knowledge-bases/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the knowledge base. Try again.");
    }
  }

  return (
    <Modal title={knowledgeBase ? "Edit knowledge base" : "New knowledge base"} onClose={onClose}>
      {noWorkspaces ? (
        <div className="space-y-4 text-sm">
          <p>A knowledge base lives inside a workspace. Create a workspace first.</p>
          <Link href="/workspaces" className="btn-primary">Go to workspaces</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {needsPicker && (
            <label className="block space-y-1 text-sm font-medium">
              Workspace
              <select name="workspace_id" required className="input" defaultValue="">
                <option value="" disabled>Choose a workspace</option>
                {workspaces.data?.items.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block space-y-1 text-sm font-medium">
            Name
            <input name="name" required maxLength={100} autoFocus defaultValue={knowledgeBase?.name} className="input" placeholder="Technology reports" />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Description
            <textarea name="description" maxLength={500} rows={2} defaultValue={knowledgeBase?.description} className="input" />
          </label>
          <details className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
            <summary className="cursor-pointer font-medium">Chunking settings</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block space-y-1 font-medium">
                Chunk size (tokens)
                <input name="chunk_size" type="number" min={200} max={2000} defaultValue={knowledgeBase?.chunk_size ?? 1000} className="input" />
              </label>
              <label className="block space-y-1 font-medium">
                Overlap (tokens)
                <input name="chunk_overlap" type="number" min={0} max={500} defaultValue={knowledgeBase?.chunk_overlap ?? 150} className="input" />
              </label>
            </div>
            <p className="mt-3 text-stone-600 dark:text-stone-400">
              Changes apply the next time a document is processed. Use Reindex on existing documents to re-chunk them.
            </p>
          </details>
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving..." : knowledgeBase ? "Save changes" : "Create knowledge base"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

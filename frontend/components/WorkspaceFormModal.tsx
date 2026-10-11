"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import Modal from "@/components/Modal";
import { ApiError } from "@/lib/api";
import { useCreateWorkspace, useUpdateWorkspace, type Workspace } from "@/lib/workspaces";
import { toast } from "@/store/toast";

export default function WorkspaceFormModal({ workspace, onClose }: { workspace?: Workspace; onClose: () => void }) {
  const router = useRouter();
  const create = useCreateWorkspace();
  const update = useUpdateWorkspace(workspace?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = { name: String(form.get("name")).trim(), description: String(form.get("description")).trim() };
    setError(null);
    try {
      if (workspace) {
        await update.mutateAsync(input);
        toast.success("Workspace saved");
        onClose();
      } else {
        const created = await create.mutateAsync(input);
        toast.success("Workspace created");
        router.push(`/workspaces/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the workspace. Try again.");
    }
  }

  return (
    <Modal title={workspace ? "Edit workspace" : "New workspace"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block space-y-1 text-sm font-medium">
          Name
          <input name="name" required maxLength={100} autoFocus defaultValue={workspace?.name} className="input" placeholder="Market research" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Description
          <textarea name="description" maxLength={500} rows={3} defaultValue={workspace?.description} className="input" placeholder="What is this workspace for?" />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving..." : workspace ? "Save changes" : "Create workspace"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

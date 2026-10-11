"use client";

import { Upload } from "lucide-react";
import { DragEvent, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { useUploadDocument } from "@/lib/documents";
import { toast } from "@/store/toast";

const EXTENSIONS = ["pdf", "docx", "txt", "csv", "md"];
const MAX_BYTES = 20 * 1024 * 1024; // mirrors the backend default; the server is the real gatekeeper

export default function UploadDropzone({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const upload = useUploadDocument(knowledgeBaseId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFiles(list: FileList | File[]) {
    setBusy(true);
    for (const file of Array.from(list)) {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!EXTENSIONS.includes(extension)) {
        toast.error(`${file.name}: only ${EXTENSIONS.map((e) => `.${e}`).join(", ")} files are supported.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: files can be up to 20 MB.`);
        continue;
      }
      try {
        await upload.mutateAsync(file);
        toast.success(`${file.name} uploaded. Processing has started.`);
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof ApiError ? err.message : "upload failed."}`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setDragging(false);
    if (!busy) void handleFiles(e.dataTransfer.files);
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-sm transition-colors disabled:opacity-60 ${
          dragging
            ? "border-teal-600 bg-teal-50 dark:bg-teal-950"
            : "border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
        }`}
      >
        <Upload size={22} aria-hidden />
        <span className="font-medium">{busy ? "Uploading..." : "Drop files here or click to choose"}</span>
        <span className="text-stone-600 dark:text-stone-400">PDF, DOCX, TXT, CSV or Markdown, up to 20 MB each</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={EXTENSIONS.map((e) => `.${e}`).join(",")}
        onChange={(e) => e.target.files && void handleFiles(e.target.files)}
      />
    </>
  );
}

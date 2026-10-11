"use client";

import { useHealth } from "@/lib/search";

/** Tells the user when the app is running on development stand-ins instead of OpenAI and Pinecone. */
export default function ProviderNote() {
  const { data } = useHealth();
  if (!data) return null;
  const { embeddings, vector_store, chat } = data.providers;

  const parts = [
    embeddings === "mock" ? "search matches shared words rather than meaning" : null,
    vector_store === "local" ? "vectors are stored in Postgres instead of Pinecone" : null,
    chat === "mock" ? "chat answers are extracted from your documents without an AI model" : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      Development mode: {parts.join("; ")}. Add OPENAI_API_KEY (and PINECONE_API_KEY for Pinecone) to the backend .env, restart, and reindex your documents for the full experience.
    </p>
  );
}

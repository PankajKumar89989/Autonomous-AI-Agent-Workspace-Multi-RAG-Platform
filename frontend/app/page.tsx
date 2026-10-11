"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Status = "checking" | "online" | "offline";

export default function Home() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((r) => r.json())
      .then((j) => setStatus(j?.data?.database ? "online" : "offline"))
      .catch(() => setStatus("offline"));
  }, []);

  const color = { checking: "bg-amber-400", online: "bg-emerald-500", offline: "bg-rose-500" }[status];

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-5 p-6 text-center">
      <h1 className="text-3xl font-bold">AI Agent Workspace</h1>
      <p className="text-stone-600 dark:text-stone-400">Research with agents that read your documents and cite their sources.</p>
      <div className="panel flex items-center gap-2 rounded-full px-4 py-2 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        Backend: {status}
      </div>
      <div className="flex gap-3">
        <Link href="/login" className="btn-primary">Log in</Link>
        <Link href="/register" className="btn-secondary">Sign up</Link>
      </div>
    </main>
  );
}

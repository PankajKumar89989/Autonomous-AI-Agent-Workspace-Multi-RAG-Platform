"use client";

import Link from "next/link";

import { useOverview } from "@/lib/dashboard";
import { timeAgo } from "@/lib/format";
import { useAuthStore } from "@/store/auth";

const STATS = [
  { key: "workspaces", label: "Workspaces" },
  { key: "documents", label: "Documents" },
  { key: "knowledge_bases", label: "Knowledge bases" },
  { key: "conversations", label: "Conversations" },
  { key: "research_tasks", label: "Research tasks" },
  { key: "ai_requests", label: "AI requests" },
] as const;

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, refetch } = useOverview();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {user?.full_name.split(" ")[0]}</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">Here is what is happening across your workspaces.</p>
        </div>
        <Link href="/workspaces" className="btn-primary">Open workspaces</Link>
      </div>

      {isError ? (
        <div className="panel flex items-center justify-between p-6 text-sm">
          <span>Could not load your dashboard.</span>
          <button className="btn-secondary" onClick={() => refetch()}>Try again</button>
        </div>
      ) : (
        <>
          <section aria-label="Totals" className="panel grid grid-cols-2 divide-x divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 md:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
            {STATS.map(({ key, label }) => (
              <div key={key} className="p-5">
                {isLoading ? (
                  <div className="h-8 w-10 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
                ) : (
                  <p className="text-3xl font-semibold tabular-nums">{data?.stats[key] ?? 0}</p>
                )}
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{label}</p>
              </div>
            ))}
          </section>

          <section aria-labelledby="activity-heading">
            <h2 id="activity-heading" className="mb-3 text-lg font-semibold">Recent activity</h2>
            <div className="panel">
              {isLoading ? (
                <div className="space-y-3 p-5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-5 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
                  ))}
                </div>
              ) : data && data.recent_activity.length > 0 ? (
                <ul className="divide-y divide-stone-200 dark:divide-stone-800">
                  {data.recent_activity.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                      <span className="flex items-center gap-3">
                        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${a.type.endsWith("deleted") || a.type.endsWith("failed") ? "bg-rose-500" : "bg-teal-600"}`} />
                        {a.message}
                      </span>
                      <time dateTime={a.created_at} className="shrink-0 text-stone-500">{timeAgo(a.created_at)}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center text-sm">
                  <p className="font-medium">No activity yet</p>
                  <p className="mt-1 text-stone-600 dark:text-stone-400">
                    Create your first workspace and your actions will show up here.
                  </p>
                  <Link href="/workspaces" className="btn-primary mt-4">Create a workspace</Link>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

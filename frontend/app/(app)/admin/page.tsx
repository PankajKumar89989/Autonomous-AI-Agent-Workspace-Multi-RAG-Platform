"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import { ApiError } from "@/lib/api";
import { useAdminOverview, useAdminUsage, useAdminUsers, useUpdateAdminUser, type AdminUser } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";

type Pending = { user: AdminUser; change: { is_active?: boolean; role?: "USER" | "ADMIN" }; title: string; message: string; label: string };

const fmt = (n: number) => n.toLocaleString("en");

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="p-5">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{label}</p>
      {note && <p className="text-xs text-stone-500">{note}</p>}
    </div>
  );
}

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden />
      {label}: {ok ? "ok" : "down"}
    </span>
  );
}

export default function AdminPage() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === "ADMIN";
  const overview = useAdminOverview(isAdmin);
  const usage = useAdminUsage(14, isAdmin);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const users = useAdminUsers(q, page, isAdmin);
  const update = useUpdateAdminUser();
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  if (!isAdmin) {
    return (
      <div className="panel p-10 text-center text-sm">
        <p className="font-medium">Administrators only</p>
        <p className="mt-1 text-stone-600 dark:text-stone-400">Your account does not have access to this page.</p>
      </div>
    );
  }

  async function apply() {
    if (!pending) return;
    try {
      await update.mutateAsync({ id: pending.user.id, ...pending.change });
      toast.success("User updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update the user.");
    }
    setPending(null);
  }

  const o = overview.data;
  const days = usage.data?.by_day ?? [];
  const peak = Math.max(1, ...days.map((d) => d.requests));
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.page_size)) : 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">System health, AI usage and users.</p>
      </div>

      {overview.isError ? (
        <div className="panel flex items-center justify-between p-6 text-sm">
          <span>Could not load the admin overview.</span>
          <button className="btn-secondary" onClick={() => overview.refetch()}>Try again</button>
        </div>
      ) : (
        <>
          <section aria-label="System health" className="panel flex flex-wrap gap-x-8 gap-y-2 p-5">
            {o ? (
              <>
                <Dot ok={o.health.database} label="Database" />
                <Dot ok={o.health.redis} label="Redis" />
                {Object.entries(o.health.providers).map(([k, v]) => (
                  <span key={k} className="text-sm text-stone-600 dark:text-stone-400">{k.replace("_", " ")}: {v}</span>
                ))}
              </>
            ) : (
              <div className="h-5 w-64 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
            )}
          </section>

          <section aria-label="Totals" className="panel grid grid-cols-2 divide-x divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 md:grid-cols-4">
            <Stat label="Users" value={o ? fmt(o.users) : "-"} note={o ? `${o.active_users} active, ${o.admins} admin` : undefined} />
            <Stat label="Workspaces" value={o ? fmt(o.workspaces) : "-"} note={o ? `${o.knowledge_bases} knowledge bases` : undefined} />
            <Stat label="Documents" value={o ? fmt(o.documents) : "-"} note={o ? `${o.failed_documents} failed` : undefined} />
            <Stat label="Conversations" value={o ? fmt(o.conversations) : "-"} />
            <Stat label="Research runs" value={o ? fmt(o.research_runs) : "-"} note={o ? `${o.running_runs} active, ${o.failed_runs} failed` : undefined} />
            <Stat label="AI requests (30 days)" value={o ? fmt(o.ai_requests_30d) : "-"} note={o ? `${(o.error_rate_30d * 100).toFixed(1)}% failed` : undefined} />
            <Stat label="Tokens (30 days)" value={o ? fmt(o.prompt_tokens_30d + o.completion_tokens_30d) : "-"} note={o ? `${fmt(o.prompt_tokens_30d)} in, ${fmt(o.completion_tokens_30d)} out` : undefined} />
            <Stat label="Average response time" value={o?.avg_duration_ms_30d != null ? `${(o.avg_duration_ms_30d / 1000).toFixed(1)}s` : "-"} />
          </section>
        </>
      )}

      <section aria-labelledby="usage-heading" className="space-y-3">
        <h2 id="usage-heading" className="text-lg font-semibold">Usage, last 14 days</h2>
        <div className="panel overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr><th className="p-3 font-medium">Day</th><th className="p-3 font-medium">Requests</th><th className="p-3 font-medium">Tokens</th><th className="p-3 font-medium">Avg time</th><th className="p-3 font-medium">Errors</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              {days.slice().reverse().map((d) => (
                <tr key={d.date}>
                  <td className="p-3">{d.date}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 tabular-nums">{d.requests}</span>
                      <span className="h-2 rounded bg-teal-600" style={{ width: `${(d.requests / peak) * 120}px` }} aria-hidden />
                    </div>
                  </td>
                  <td className="p-3 tabular-nums">{fmt(d.prompt_tokens + d.completion_tokens)}</td>
                  <td className="p-3 tabular-nums">{d.avg_duration_ms != null ? `${(d.avg_duration_ms / 1000).toFixed(1)}s` : "-"}</td>
                  <td className={`p-3 tabular-nums ${d.errors ? "text-rose-700 dark:text-rose-400" : ""}`}>{d.errors}</td>
                </tr>
              ))}
              {usage.isLoading && <tr><td className="p-3 text-stone-500" colSpan={5}>Loading...</td></tr>}
            </tbody>
          </table>
        </div>
        {usage.data && (usage.data.by_model.length > 0 || usage.data.by_kind.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="panel p-4 text-sm">
              <p className="mb-2 font-medium">By model</p>
              <ul className="space-y-1">{usage.data.by_model.map((m) => <li key={m.model} className="flex justify-between"><span>{m.model}</span><span className="text-stone-500">{fmt(m.requests)} requests, {fmt(m.tokens)} tokens</span></li>)}</ul>
            </div>
            <div className="panel p-4 text-sm">
              <p className="mb-2 font-medium">By kind</p>
              <ul className="space-y-1">{usage.data.by_kind.map((k) => <li key={k.kind} className="flex justify-between"><span className="capitalize">{k.kind}</span><span className="text-stone-500">{fmt(k.requests)} requests, {fmt(k.tokens)} tokens</span></li>)}</ul>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="users-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="users-heading" className="text-lg font-semibold">Users</h2>
          <div className="relative w-full max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden />
            <input type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search name or email" aria-label="Search users" className="input pl-9" />
          </div>
        </div>
        <ul className="panel divide-y divide-stone-200 dark:divide-stone-800">
          {users.data?.items.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{u.full_name} <span className="font-normal text-stone-500">{u.email}</span></p>
                <p className="text-xs text-stone-500">
                  {u.role}{u.is_active ? "" : ", deactivated"}, joined {formatDate(u.created_at)}, {u.workspaces} workspaces, {u.documents} documents, {u.requests_30d} AI requests in 30 days
                </p>
              </div>
              {u.id === me?.id ? (
                <span className="text-xs text-stone-500">This is you</span>
              ) : (
                <div className="flex gap-2">
                  <button className="btn-secondary px-3 py-1.5" onClick={() => setPending({ user: u, change: { role: u.role === "ADMIN" ? "USER" : "ADMIN" }, title: u.role === "ADMIN" ? "Remove admin access?" : "Make this user an admin?", message: `${u.email} will ${u.role === "ADMIN" ? "lose" : "get"} access to this page and every user's usage.`, label: u.role === "ADMIN" ? "Remove admin" : "Make admin" })}>
                    {u.role === "ADMIN" ? "Remove admin" : "Make admin"}
                  </button>
                  <button className={`btn-secondary px-3 py-1.5 ${u.is_active ? "text-rose-700 dark:text-rose-400" : ""}`} onClick={() => setPending({ user: u, change: { is_active: !u.is_active }, title: u.is_active ? "Deactivate user?" : "Reactivate user?", message: u.is_active ? `${u.email} will be signed out everywhere and unable to sign in until you reactivate them.` : `${u.email} will be able to sign in again.`, label: u.is_active ? "Deactivate" : "Reactivate" })}>
                    {u.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              )}
            </li>
          ))}
          {users.data?.items.length === 0 && <li className="p-6 text-center text-stone-500">No users match.</li>}
        </ul>
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="text-stone-600 dark:text-stone-400">Page {page} of {totalPages}</span>
            <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </section>

      {pending && <ConfirmDialog title={pending.title} message={pending.message} confirmLabel={pending.label} busy={update.isPending} onConfirm={apply} onClose={() => setPending(null)} />}
    </div>
  );
}

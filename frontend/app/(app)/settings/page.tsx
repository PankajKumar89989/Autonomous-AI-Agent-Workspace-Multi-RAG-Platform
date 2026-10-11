"use client";

import { useMyUsage } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { useThemeStore, type Theme } from "@/store/theme";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { theme, setTheme } = useThemeStore();
  const usage = useMyUsage();
  const rows = [
    ["Name", user?.full_name],
    ["Email", user?.email],
    ["Role", user?.role],
    ["Member since", user ? formatDate(user.created_at) : ""],
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="mb-3 text-lg font-semibold">Profile</h2>
        <dl className="panel divide-y divide-stone-200 dark:divide-stone-800">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 p-4 text-sm">
              <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading" className="mb-3 text-lg font-semibold">Your AI usage, last 30 days</h2>
        <div className="panel divide-y divide-stone-200 text-sm dark:divide-stone-800">
          {usage.data ? (
            <>
              <div className="flex justify-between gap-4 p-4"><span className="text-stone-600 dark:text-stone-400">AI requests</span><span className="font-medium tabular-nums">{usage.data.ai_requests.toLocaleString("en")}</span></div>
              <div className="flex justify-between gap-4 p-4"><span className="text-stone-600 dark:text-stone-400">Tokens used</span><span className="font-medium tabular-nums">{usage.data.tokens.toLocaleString("en")}</span></div>
              {usage.data.by_kind.map((k) => (
                <div key={k.kind} className="flex justify-between gap-4 p-4"><span className="capitalize text-stone-600 dark:text-stone-400">{k.kind}</span><span className="tabular-nums">{k.requests} requests, {k.tokens.toLocaleString("en")} tokens</span></div>
              ))}
            </>
          ) : (
            <div className="p-4 text-stone-500">{usage.isError ? "Could not load your usage." : "Loading..."}</div>
          )}
        </div>
      </section>

      <section aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="mb-3 text-lg font-semibold">Appearance</h2>
        <div className="flex gap-2" role="group" aria-label="Theme">
          {(["light", "dark"] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              aria-pressed={theme === t}
              className={`${theme === t ? "btn-primary" : "btn-secondary"} capitalize`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Page } from "@/lib/workspaces";

export type KindUsage = { kind: string; requests: number; tokens: number };

export type MyUsage = { days: number; ai_requests: number; tokens: number; by_kind: KindUsage[] };

export type AdminOverview = {
  users: number; active_users: number; admins: number; workspaces: number; knowledge_bases: number;
  documents: number; failed_documents: number; conversations: number; research_runs: number;
  running_runs: number; failed_runs: number; ai_requests_30d: number; prompt_tokens_30d: number;
  completion_tokens_30d: number; avg_duration_ms_30d: number | null; error_rate_30d: number;
  health: { database: boolean; redis: boolean; providers: Record<string, string> };
};

export type DailyUsage = { date: string; requests: number; prompt_tokens: number; completion_tokens: number; avg_duration_ms: number | null; errors: number };
export type UsageReport = { days: number; by_day: DailyUsage[]; by_model: { model: string; requests: number; tokens: number }[]; by_kind: KindUsage[] };

export type AdminUser = {
  id: string; email: string; full_name: string; role: "USER" | "ADMIN"; is_active: boolean;
  created_at: string; workspaces: number; documents: number; requests_30d: number;
};

export const useMyUsage = () => useQuery({ queryKey: ["my-usage"], queryFn: () => api<MyUsage>("/usage/me") });

export const useAdminOverview = (enabled: boolean) =>
  useQuery({ queryKey: ["admin-overview"], queryFn: () => api<AdminOverview>("/admin/overview"), enabled, refetchInterval: 30_000 });

export const useAdminUsage = (days: number, enabled: boolean) =>
  useQuery({ queryKey: ["admin-usage", days], queryFn: () => api<UsageReport>(`/admin/usage?days=${days}`), enabled });

export function useAdminUsers(q: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-users", { q, page }],
    queryFn: () => api<Page<AdminUser>>(`/admin/users?${new URLSearchParams({ q, page: String(page), page_size: "20" })}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; is_active?: boolean; role?: "USER" | "ADMIN" }) =>
      api<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
}

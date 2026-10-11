"use client";

import { BookOpen, Bot, FolderKanban, LayoutDashboard, LogOut, Menu, MessageSquare, Search, Settings, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ThemeToggle from "@/components/ThemeToggle";
import { logout } from "@/lib/auth";
import { useAuthStore } from "@/store/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspaces", label: "Workspaces", icon: FolderKanban },
  { href: "/knowledge-bases", label: "Knowledge bases", icon: BookOpen },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/research", label: "Research", icon: Search },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];
function SidebarNav() {
  const pathname = usePathname();
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const items = isAdmin ? [...NAV, { href: "/admin", label: "Admin", icon: ShieldCheck }] : NAV;
  return (
    <nav className="flex flex-col gap-1 p-3 text-sm" aria-label="Main">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 font-medium ${
              active
                ? "border-teal-600 bg-stone-100 dark:bg-stone-800"
                : "border-transparent text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => setDrawerOpen(false), [pathname]);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  const brand = <div className="px-6 py-5 text-base font-bold">Agent Workspace</div>;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 md:block">
        <div className="sticky top-0">
          {brand}
          <SidebarNav />
        </div>
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-stone-950/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-stone-900">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="rounded p-2 hover:bg-stone-100 dark:hover:bg-stone-800">
                <X size={18} />
              </button>
            </div>
            <SidebarNav />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-stone-100 dark:hover:bg-stone-800 md:hidden">
            <Menu size={20} />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden text-sm text-stone-600 dark:text-stone-400 sm:inline">{user?.full_name}</span>
            <button onClick={onLogout} aria-label="Log out" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800">
              <LogOut size={18} />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { login, register } from "@/lib/auth";
import { useAuthStore } from "@/store/auth";

const inputClass = "input";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isLogin = mode === "login";

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setError(null);
    setSubmitting(true);
    try {
      if (isLogin) await login(email, password);
      else await register(String(form.get("full_name")), email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 panel p-8">
        <div>
          <h1 className="text-2xl font-bold">{isLogin ? "Welcome back" : "Create your account"}</h1>
          <p className="text-sm text-stone-500">AI Agent Workspace</p>
        </div>

        {!isLogin && (
          <label className="block space-y-1 text-sm font-medium">
            Full name
            <input name="full_name" required maxLength={100} autoComplete="name" className={inputClass} />
          </label>
        )}
        <label className="block space-y-1 text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={isLogin ? 1 : 8}
            maxLength={72}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className={inputClass}
          />
          {!isLogin && <span className="block text-xs font-normal text-stone-500">8+ characters with letters and numbers.</span>}
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full"
        >
          {submitting ? "Please wait..." : isLogin ? "Log in" : "Sign up"}
        </button>

        <p className="text-center text-sm text-stone-600 dark:text-stone-400">
          {isLogin ? "No account yet? " : "Already registered? "}
          <Link href={isLogin ? "/register" : "/login"} className="font-medium text-teal-600 hover:underline">
            {isLogin ? "Sign up" : "Log in"}
          </Link>
        </p>
      </form>
    </main>
  );
}

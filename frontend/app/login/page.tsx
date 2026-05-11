"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@nelson.ai");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Wrong email or password.");
      } else {
        setError(err instanceof Error ? err.message : "Login failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="glass-deep rounded-3xl p-10 w-full max-w-sm animate-slide-up"
      >
        <div className="mb-8 flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-accent-500/40">
            N
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-risk-low rounded-full ring-2 ring-ink-900 animate-pulse-soft" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Nelson</h1>
            <p className="text-white/50 text-xs mt-0.5">AI Account Intelligence</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-white/50">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent-500/60 focus:bg-white/10 transition"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-white/50">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent-500/60 focus:bg-white/10 transition"
              autoComplete="current-password"
            />
          </label>

          {error && (
            <div className="text-sm text-risk-critical bg-risk-critical/10 border border-risk-critical/30 rounded-lg px-3 py-2 animate-fade-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full mt-2 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 disabled:cursor-wait text-white font-medium rounded-xl py-3 transition shadow-lg shadow-accent-500/30"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </div>

        <p className="text-xs text-white/30 mt-6 text-center">
          Demo credentials are pre-filled.
        </p>
      </form>
    </div>
  );
}

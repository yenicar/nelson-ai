"use client";

import { Bell, Sparkles } from "lucide-react";
import { PortfolioSummary } from "@/lib/types";
import { fmtMoney } from "@/lib/format";

interface Props {
  summary: PortfolioSummary | null;
  pendingActionsCount: number;
}

export function AppHeader({ summary, pendingActionsCount }: Props) {
  const greeting = getGreeting();
  const atRisk = (summary?.critical_count ?? 0) + (summary?.high_count ?? 0);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/40">{greeting}</div>
        <h1 className="text-lg font-semibold tracking-tight text-white mt-0.5">
          Portfolio command center
        </h1>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {summary && (
          <div className="hidden md:flex items-center gap-3 text-xs text-white/55 mr-2">
            <span>
              <span className="text-white font-medium">{atRisk}</span> at risk
            </span>
            <span className="text-white/20">·</span>
            <span>
              <span className="text-white font-medium">
                {fmtMoney(summary.revenue_at_risk ?? 0)}
              </span>{" "}
              exposed
            </span>
          </div>
        )}

        {pendingActionsCount > 0 && (
          <div className="glass rounded-full pl-3 pr-1 py-1 flex items-center gap-2 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-accent-400" />
            <span className="text-white">{pendingActionsCount} pending</span>
            <span className="bg-accent-500/20 text-accent-400 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
              NEW
            </span>
          </div>
        )}

        <button
          aria-label="Notifications"
          className="glass rounded-full p-2 relative hover:bg-white/10 transition"
        >
          <Bell className="w-4 h-4 text-white/65" />
          {pendingActionsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-risk-critical rounded-full animate-pulse-soft" />
          )}
        </button>
      </div>
    </header>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Late night";
}

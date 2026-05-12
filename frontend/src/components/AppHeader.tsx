"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Clock, History, Sparkles, X } from "lucide-react";
import { PortfolioSummary } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  summary: PortfolioSummary | null;
  pendingActionsCount: number;
  pendingFollowupsCount: number;
  onJumpToActions: () => void;
  onJumpToDecisions: () => void;
  onJumpToFollowups: () => void;
}

export function AppHeader({
  summary,
  pendingActionsCount,
  pendingFollowupsCount,
  onJumpToActions,
  onJumpToDecisions,
  onJumpToFollowups,
}: Props) {
  const greeting = getGreeting();
  const atRisk = (summary?.critical_count ?? 0) + (summary?.high_count ?? 0);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const totalNotifications = pendingActionsCount + pendingFollowupsCount;

  // Close bell dropdown on outside-click + escape.
  useEffect(() => {
    if (!bellOpen) return;
    function onClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setBellOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [bellOpen]);

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
          <button
            onClick={onJumpToActions}
            className="glass rounded-full pl-3 pr-1 py-1 flex items-center gap-2 text-xs hover:bg-white/10 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent-400" />
            <span className="text-white">{pendingActionsCount} pending</span>
            <span className="bg-accent-500/20 text-accent-400 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
              NEW
            </span>
          </button>
        )}

        <ThemeToggle />

        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setBellOpen((v) => !v)}
            aria-label="Notifications"
            aria-expanded={bellOpen}
            className={`glass rounded-full p-2 relative transition ${
              bellOpen ? "bg-white/15 ring-1 ring-accent-500/40" : "hover:bg-white/10"
            }`}
          >
            <Bell className="w-4 h-4 text-white/65" />
            {totalNotifications > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-risk-critical rounded-full animate-pulse-soft" />
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 glass-deep rounded-xl border border-white/10 shadow-glass-deep animate-fade-in z-50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/8">
                <div className="text-xs uppercase tracking-wider text-white/50">Notifications</div>
                <button
                  onClick={() => setBellOpen(false)}
                  className="text-white/40 hover:text-white transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="p-1.5">
                <NotificationRow
                  icon={<Sparkles className="w-3.5 h-3.5 text-accent-400" />}
                  label="Pending actions"
                  count={pendingActionsCount}
                  description="Nelson-drafted, awaiting your approval"
                  onClick={() => {
                    setBellOpen(false);
                    onJumpToActions();
                  }}
                />
                <NotificationRow
                  icon={<Clock className="w-3.5 h-3.5 text-risk-moderate" />}
                  label="Pending follow-ups"
                  count={pendingFollowupsCount}
                  description="Reviews awaiting outcome confirmation"
                  onClick={() => {
                    setBellOpen(false);
                    onJumpToFollowups();
                  }}
                />
                <NotificationRow
                  icon={<History className="w-3.5 h-3.5 text-white/60" />}
                  label="Audit trail"
                  count={null}
                  description="See all approved/rejected decisions"
                  onClick={() => {
                    setBellOpen(false);
                    onJumpToDecisions();
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NotificationRow({
  icon,
  label,
  count,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number | null;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/8 transition text-left group"
    >
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-white">{label}</span>
          {count != null && count > 0 && (
            <span className="text-[10px] font-semibold bg-accent-500/20 text-accent-400 px-1.5 py-0.5 rounded-full">
              {count}
            </span>
          )}
          {count != null && count === 0 && (
            <span className="text-[10px] text-white/40">empty</span>
          )}
        </div>
        <div className="text-[11px] text-white/50 leading-snug">{description}</div>
      </div>
    </button>
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

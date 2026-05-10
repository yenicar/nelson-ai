"use client";

// Top of dashboard — Gartner level 1: DESCRIPTIVE.
// Five tiles answering "what's the state of the portfolio right now?"

import { PortfolioSummary } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { Activity, AlertOctagon, DollarSign, Heart, Users } from "lucide-react";
import { AnimatedNumber } from "./AnimatedNumber";

interface Props {
  summary: PortfolioSummary | null;
  pendingFollowupsCount: number;
  pendingActionsCount: number;
}

export function KPIStrip({ summary, pendingFollowupsCount, pendingActionsCount }: Props) {
  // Skeleton state when summary hasn't loaded yet
  if (!summary) {
    return (
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="glass-deep rounded-2xl px-4 py-3 animate-pulse-soft"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="h-2.5 w-16 bg-white/10 rounded mb-3" />
            <div className="h-7 w-24 bg-white/15 rounded mb-2" />
            <div className="h-2 w-32 bg-white/8 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const total = summary.total_customers ?? 0;
  const atRisk = (summary.critical_count ?? 0) + (summary.high_count ?? 0);
  const atRiskPct = total > 0 ? Math.round((atRisk / total) * 100) : 0;

  return (
    <div className="grid grid-cols-5 gap-3">
      <Tile
        label="Customers"
        valueNode={<AnimatedNumber value={total} />}
        sublabel="under management"
        icon={<Users className="w-4 h-4" />}
      />
      <Tile
        label="Revenue"
        valueNode={
          <AnimatedNumber value={summary.total_revenue ?? 0} format={fmtMoney} />
        }
        sublabel={`${fmtMoney(summary.total_profit ?? 0)} profit`}
        icon={<DollarSign className="w-4 h-4" />}
      />
      <Tile
        label="At risk"
        valueNode={<AnimatedNumber value={atRisk} />}
        sublabel={`${atRiskPct}% of portfolio · ${fmtMoney(summary.revenue_at_risk ?? 0)} exposed`}
        icon={<AlertOctagon className="w-4 h-4 text-risk-critical" />}
        emphasis={atRiskPct >= 20 ? "critical" : "default"}
      >
        <BandBar summary={summary} />
      </Tile>
      <Tile
        label="Avg health"
        valueNode={
          <>
            <AnimatedNumber value={Math.round(summary.avg_health_score ?? 0)} />
            <span className="text-base text-white/40">/100</span>
          </>
        }
        sublabel={`Avg risk ${Math.round(summary.avg_risk_score ?? 0)}/100`}
        icon={<Heart className="w-4 h-4 text-risk-low" />}
      />
      <Tile
        label="Action queue"
        valueNode={
          <AnimatedNumber value={pendingFollowupsCount + pendingActionsCount} />
        }
        sublabel={`${pendingFollowupsCount} follow-ups · ${pendingActionsCount} approvals`}
        icon={<Activity className="w-4 h-4 text-accent-400" />}
        emphasis={pendingFollowupsCount + pendingActionsCount > 0 ? "accent" : "default"}
      />
    </div>
  );
}

interface TileProps {
  label: string;
  valueNode: React.ReactNode;
  sublabel?: string;
  icon?: React.ReactNode;
  emphasis?: "default" | "critical" | "accent";
  children?: React.ReactNode;
}

function Tile({ label, valueNode, sublabel, icon, emphasis = "default", children }: TileProps) {
  const ring =
    emphasis === "critical"
      ? "ring-1 ring-risk-critical/30"
      : emphasis === "accent"
        ? "ring-1 ring-accent-500/30"
        : "";
  return (
    <div className={`glass-deep rounded-2xl px-4 py-3 ${ring}`}>
      <div className="flex items-center justify-between text-white/40 text-[10px] uppercase tracking-wider">
        <span>{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold mt-1 leading-tight tabular-nums">{valueNode}</div>
      {sublabel && <div className="text-[11px] text-white/50 mt-0.5 truncate">{sublabel}</div>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function BandBar({ summary }: { summary: PortfolioSummary | null }) {
  const total = (summary?.total_customers ?? 0) || 1;
  const c = summary?.critical_count ?? 0;
  const h = summary?.high_count ?? 0;
  const m = summary?.moderate_count ?? 0;
  const l = summary?.low_count ?? 0;
  const cw = (c / total) * 100;
  const hw = (h / total) * 100;
  const mw = (m / total) * 100;
  const lw = (l / total) * 100;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
      <div className="bg-risk-critical" style={{ width: `${cw}%` }} title={`Critical: ${c}`} />
      <div className="bg-risk-high" style={{ width: `${hw}%` }} title={`High: ${h}`} />
      <div className="bg-risk-moderate" style={{ width: `${mw}%` }} title={`Moderate: ${m}`} />
      <div className="bg-risk-low" style={{ width: `${lw}%` }} title={`Low: ${l}`} />
    </div>
  );
}

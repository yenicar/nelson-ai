"use client";

// Secondary metrics row — sits between the KPI strip (descriptive) and the
// diagnostic canvas. Smaller than KPIStrip tiles; each one carries a visual
// (bar, gauge, distribution) so the row reads as "here's the shape of the
// portfolio" not "here are more numbers."

import { PortfolioSummary } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { Activity, BarChart3, Heart, PieChart } from "lucide-react";

interface Props {
  summary: PortfolioSummary | null;
}

export function PortfolioMetrics({ summary }: Props) {
  if (!summary) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="glass rounded-2xl px-4 py-3 h-[88px] animate-pulse-soft"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  const customers = summary.total_customers ?? 0;
  const revenue = summary.total_revenue ?? 0;
  const profit = summary.total_profit ?? 0;
  const avgDeal = customers > 0 ? revenue / customers : 0;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const health = summary.avg_health_score ?? 0;

  return (
    <div className="grid grid-cols-4 gap-3">
      <MiniTile icon={<BarChart3 className="w-3.5 h-3.5" />} label="Avg deal size">
        <div className="text-lg font-semibold tabular-nums">{fmtMoney(avgDeal)}</div>
        <div className="text-[10px] text-white/45 mt-1">per customer, lifetime</div>
      </MiniTile>

      <MiniTile icon={<PieChart className="w-3.5 h-3.5" />} label="Profit margin">
        <div className="flex items-baseline gap-2">
          <div className="text-lg font-semibold tabular-nums">{margin.toFixed(1)}%</div>
          <div className="text-[10px] text-white/45">{fmtMoney(profit)}</div>
        </div>
        <ProgressBar pct={Math.max(0, Math.min(100, margin))} tone={margin >= 20 ? "good" : margin >= 10 ? "okay" : "warn"} />
      </MiniTile>

      <MiniTile icon={<Heart className="w-3.5 h-3.5" />} label="Avg health">
        <div className="flex items-baseline gap-2">
          <div className="text-lg font-semibold tabular-nums">{Math.round(health)}</div>
          <div className="text-[10px] text-white/45">out of 100</div>
        </div>
        <ProgressBar pct={Math.max(0, Math.min(100, health))} tone={health >= 70 ? "good" : health >= 40 ? "okay" : "warn"} />
      </MiniTile>

      <MiniTile icon={<Activity className="w-3.5 h-3.5" />} label="Risk distribution">
        <BandDistribution summary={summary} />
      </MiniTile>
    </div>
  );
}

function MiniTile({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/45 mb-1.5">
        <span className="text-white/55">{icon}</span>
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

function ProgressBar({ pct, tone }: { pct: number; tone: "good" | "okay" | "warn" }) {
  const cls =
    tone === "good"
      ? "bg-risk-low"
      : tone === "okay"
        ? "bg-risk-moderate"
        : "bg-risk-high";
  return (
    <div className="mt-2 h-1 rounded-full bg-white/8 overflow-hidden">
      <div
        className={`h-full ${cls} transition-all duration-700`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BandDistribution({ summary }: { summary: PortfolioSummary }) {
  const total = (summary.total_customers ?? 0) || 1;
  const c = summary.critical_count ?? 0;
  const h = summary.high_count ?? 0;
  const m = summary.moderate_count ?? 0;
  const l = summary.low_count ?? 0;
  const seg = (n: number) => (n / total) * 100;
  return (
    <>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        <div className="bg-risk-critical" style={{ width: `${seg(c)}%` }} title={`Critical: ${c}`} />
        <div className="bg-risk-high" style={{ width: `${seg(h)}%` }} title={`High: ${h}`} />
        <div className="bg-risk-moderate" style={{ width: `${seg(m)}%` }} title={`Moderate: ${m}`} />
        <div className="bg-risk-low" style={{ width: `${seg(l)}%` }} title={`Low: ${l}`} />
      </div>
      <div className="flex justify-between text-[10px] text-white/45 mt-1.5 tabular-nums">
        <span><span className="text-risk-critical">●</span> {c}</span>
        <span><span className="text-risk-high">●</span> {h}</span>
        <span><span className="text-risk-moderate">●</span> {m}</span>
        <span><span className="text-risk-low">●</span> {l}</span>
      </div>
    </>
  );
}

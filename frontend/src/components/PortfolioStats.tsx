"use client";

import { PortfolioSummary } from "@/lib/types";
import { fmtMoney } from "@/lib/format";

export function PortfolioStats({ summary }: { summary: PortfolioSummary | null }) {
  if (!summary) {
    return (
      <div className="glass-deep rounded-2xl p-5 animate-pulse-soft">
        <div className="text-white/40 text-sm">Loading portfolio...</div>
      </div>
    );
  }
  return (
    <div className="glass-deep rounded-2xl p-5 space-y-4 w-72">
      <div>
        <div className="text-xs uppercase tracking-wider text-white/40">Portfolio</div>
        <div className="text-2xl font-semibold mt-1">
          {summary.total_customers?.toLocaleString() ?? "—"} <span className="text-sm text-white/40">customers</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Band label="Critical" count={summary.critical_count} cls="bg-risk-critical/30 text-risk-critical" />
        <Band label="High" count={summary.high_count} cls="bg-risk-high/30 text-risk-high" />
        <Band label="Mod" count={summary.moderate_count} cls="bg-risk-moderate/30 text-risk-moderate" />
        <Band label="Low" count={summary.low_count} cls="bg-risk-low/30 text-risk-low" />
      </div>

      <div className="pt-3 border-t border-white/10 text-xs space-y-1">
        <Row label="Total revenue" value={fmtMoney(summary.total_revenue)} />
        <Row label="Total profit" value={fmtMoney(summary.total_profit)} />
      </div>
    </div>
  );
}

function Band({ label, count, cls }: { label: string; count?: number; cls: string }) {
  return (
    <div className={`rounded-lg px-2 py-2 text-center ${cls}`}>
      <div className="text-lg font-semibold leading-none">{count ?? 0}</div>
      <div className="text-[10px] uppercase tracking-wide mt-1 opacity-70">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-white/60">
      <span>{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

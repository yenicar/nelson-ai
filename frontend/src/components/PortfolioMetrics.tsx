"use client";

// Secondary metrics — two rows of four. Sits between the KPI strip
// (descriptive) and the diagnostic canvas. Every tile carries a visual so
// the section reads as the shape of the portfolio, not a number dump.

import { PortfolioSummary, SentimentBreakdown } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Heart,
  Inbox,
  PieChart,
  ThumbsUp,
  TrendingDown,
  Trophy,
} from "lucide-react";

interface Props {
  summary: PortfolioSummary | null;
  sentiment?: SentimentBreakdown | null;
}

export function PortfolioMetrics({ summary, sentiment }: Props) {
  if (!summary) {
    return (
      <div className="space-y-3">
        {[0, 1].map((row) => (
          <div key={row} className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="glass rounded-2xl px-4 py-3 h-[92px] animate-pulse-soft"
                style={{ animationDelay: `${(row * 4 + i) * 50}ms` }}
              />
            ))}
          </div>
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
  const lateRate = (summary.avg_late_delivery_rate ?? 0) * 100;
  const churn = summary.churn_flag_count ?? 0;
  const churnPct = customers > 0 ? (churn / customers) * 100 : 0;
  const ticketBacklog = summary.open_ticket_backlog ?? 0;
  const top10Rev = summary.revenue_top10 ?? 0;
  const concentration = revenue > 0 ? (top10Rev / revenue) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Row 1 — economics + health */}
      <div className="grid grid-cols-4 gap-3">
        <MiniTile icon={<BarChart3 className="w-3.5 h-3.5" />} label="Avg deal size">
          <div className="text-lg font-semibold tabular-nums">{fmtMoney(avgDeal)}</div>
          <ProfitVsRevenueBar revenue={revenue} profit={profit} />
        </MiniTile>

        <MiniTile icon={<PieChart className="w-3.5 h-3.5" />} label="Profit margin">
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-semibold tabular-nums">{margin.toFixed(1)}%</div>
            <div className="text-[10px] text-white/45">{fmtMoney(profit)}</div>
          </div>
          <ProgressBar pct={clamp(margin)} tone={margin >= 20 ? "good" : margin >= 10 ? "okay" : "warn"} />
        </MiniTile>

        <MiniTile icon={<Heart className="w-3.5 h-3.5" />} label="Avg health">
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-semibold tabular-nums">{Math.round(health)}</div>
            <div className="text-[10px] text-white/45">out of 100</div>
          </div>
          <ProgressBar pct={clamp(health)} tone={health >= 70 ? "good" : health >= 40 ? "okay" : "warn"} />
        </MiniTile>

        <MiniTile icon={<Activity className="w-3.5 h-3.5" />} label="Risk distribution">
          <BandDistribution summary={summary} />
        </MiniTile>
      </div>

      {/* Row 2 — operational signals (5 cols since user asked for all of these) */}
      <div className="grid grid-cols-5 gap-3">
        <MiniTile icon={<TrendingDown className="w-3.5 h-3.5" />} label="Late delivery">
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-semibold tabular-nums">{lateRate.toFixed(1)}%</div>
            <div className="text-[10px] text-white/45">avg rate</div>
          </div>
          <ProgressBar pct={clamp(lateRate)} tone={lateRate <= 10 ? "good" : lateRate <= 25 ? "okay" : "warn"} invertTone />
        </MiniTile>

        <MiniTile icon={<Trophy className="w-3.5 h-3.5" />} label="Top-10% revenue">
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-semibold tabular-nums">{concentration.toFixed(0)}%</div>
            <div className="text-[10px] text-white/45">concentration</div>
          </div>
          <ProgressBar pct={clamp(concentration)} tone={concentration >= 60 ? "warn" : concentration >= 40 ? "okay" : "good"} />
        </MiniTile>

        <MiniTile icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Churn flags">
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-semibold tabular-nums">{churn.toLocaleString()}</div>
            <div className="text-[10px] text-white/45">{churnPct.toFixed(1)}% of book</div>
          </div>
          <ProgressBar pct={clamp(churnPct)} tone={churnPct <= 5 ? "good" : churnPct <= 15 ? "okay" : "warn"} invertTone />
        </MiniTile>

        <MiniTile icon={<Inbox className="w-3.5 h-3.5" />} label="Ticket backlog">
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-semibold tabular-nums">{ticketBacklog.toLocaleString()}</div>
            <div className="text-[10px] text-white/45">open tickets</div>
          </div>
          <TicketDensity backlog={ticketBacklog} customers={customers} />
        </MiniTile>

        <MiniTile icon={<ThumbsUp className="w-3.5 h-3.5" />} label="NPS-style">
          <div className="flex items-baseline gap-2">
            <div
              className={`text-lg font-semibold tabular-nums ${
                sentiment && sentiment.net >= 0 ? "text-risk-low" : sentiment ? "text-risk-critical" : ""
              }`}
            >
              {sentiment ? (sentiment.net > 0 ? "+" : "") + sentiment.net : "—"}
            </div>
            <div className="text-[10px] text-white/45">net score</div>
          </div>
          <NPSBar sentiment={sentiment} />
        </MiniTile>
      </div>
    </div>
  );
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
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

function ProgressBar({
  pct,
  tone,
  invertTone = false,
}: {
  pct: number;
  tone: "good" | "okay" | "warn";
  invertTone?: boolean;
}) {
  // invertTone: when the metric is "lower is better" (late rate, churn), the
  // bar still grows with the value but its color reflects "danger as it grows."
  const cls = (() => {
    const effective = invertTone ? (tone === "good" ? "good" : tone === "okay" ? "okay" : "warn") : tone;
    return effective === "good" ? "bg-risk-low" : effective === "okay" ? "bg-risk-moderate" : "bg-risk-high";
  })();
  return (
    <div className="mt-2 h-1 rounded-full bg-white/8 overflow-hidden">
      <div className={`h-full ${cls} transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ProfitVsRevenueBar({ revenue, profit }: { revenue: number; profit: number }) {
  const cost = Math.max(0, revenue - profit);
  const total = revenue || 1;
  const profitPct = (profit / total) * 100;
  const costPct = (cost / total) * 100;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
        <div className="bg-risk-low" style={{ width: `${profitPct}%` }} title={`Profit: ${fmtMoney(profit)}`} />
        <div className="bg-white/15" style={{ width: `${costPct}%` }} title={`Cost: ${fmtMoney(cost)}`} />
      </div>
      <div className="flex justify-between text-[10px] text-white/45">
        <span><span className="text-risk-low">●</span> {fmtMoney(profit)} profit</span>
        <span className="text-white/35">{fmtMoney(cost)} cost</span>
      </div>
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

function NPSBar({ sentiment }: { sentiment?: SentimentBreakdown | null }) {
  // No time series → static promoter/passive/detractor split across all
  // signals. Labels under the bar give the actual counts.
  if (!sentiment || sentiment.total === 0) {
    return <div className="mt-2 h-1.5 rounded-full bg-white/5" />;
  }
  const total = sentiment.total;
  const p = (sentiment.positive / total) * 100;
  const n = (sentiment.neutral / total) * 100;
  const d = (sentiment.negative / total) * 100;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
        <div className="bg-risk-low" style={{ width: `${p}%` }} title={`Promoters: ${sentiment.positive}`} />
        <div className="bg-white/15" style={{ width: `${n}%` }} title={`Passives: ${sentiment.neutral}`} />
        <div className="bg-risk-critical" style={{ width: `${d}%` }} title={`Detractors: ${sentiment.negative}`} />
      </div>
      <div className="flex justify-between text-[10px] text-white/45 tabular-nums">
        <span><span className="text-risk-low">●</span> {sentiment.positive}</span>
        <span><span className="text-risk-critical">●</span> {sentiment.negative}</span>
      </div>
    </div>
  );
}

function TicketDensity({ backlog, customers }: { backlog: number; customers: number }) {
  // Tickets-per-customer ratio expressed as a 0-100 fill where 100 = 1 ticket
  // per customer. Most B2B portfolios stay well under that; the bar going past
  // ~50% should be alarming.
  const ratio = customers > 0 ? (backlog / customers) * 100 : 0;
  const tone = ratio <= 20 ? "good" : ratio <= 50 ? "okay" : "warn";
  return (
    <div className="mt-2 space-y-1">
      <ProgressBar pct={clamp(ratio)} tone={tone} invertTone />
      <div className="flex justify-between text-[10px] text-white/45 tabular-nums">
        <span>{(ratio / 100).toFixed(2)} per customer</span>
      </div>
    </div>
  );
}

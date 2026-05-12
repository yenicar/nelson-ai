"use client";

// Top of dashboard — Gartner level 1: DESCRIPTIVE.
// Four tiles. One number per tile. One short caption. No pipes, no clutter.

import { PortfolioSummary, SentimentBreakdown } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { Activity, AlertOctagon, DollarSign, MessageCircle } from "lucide-react";
import { AnimatedNumber } from "./AnimatedNumber";
import { sentimentTone } from "./SentimentBar";

interface Props {
  summary: PortfolioSummary | null;
  sentiment?: SentimentBreakdown | null;
  pendingFollowupsCount: number;
  pendingActionsCount: number;
}

export function KPIStrip({
  summary,
  sentiment,
  pendingFollowupsCount,
  pendingActionsCount,
}: Props) {
  if (!summary) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="glass-deep rounded-2xl px-5 py-4 animate-pulse-soft h-[104px]"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    );
  }

  const total = summary.total_customers ?? 0;
  const atRisk = (summary.critical_count ?? 0) + (summary.high_count ?? 0);
  const atRiskPct = total > 0 ? Math.round((atRisk / total) * 100) : 0;
  const queue = pendingFollowupsCount + pendingActionsCount;

  return (
    <div className="grid grid-cols-4 gap-3">
      <Tile
        icon={<DollarSign className="w-4 h-4" />}
        label="Revenue"
        value={<AnimatedNumber value={summary.total_revenue ?? 0} format={fmtMoney} />}
        caption={`${total.toLocaleString()} customers`}
      />
      <Tile
        icon={<AlertOctagon className="w-4 h-4" />}
        label="At risk"
        value={<AnimatedNumber value={atRisk} />}
        caption={`${atRiskPct}% · ${fmtMoney(summary.revenue_at_risk ?? 0)} exposed`}
        emphasis={atRiskPct >= 20 ? "critical" : "default"}
      />
      <Tile
        icon={<MessageCircle className="w-4 h-4" />}
        label="Sentiment"
        value={
          <span className={sentimentTone(sentiment?.net)}>
            {sentiment ? (
              <>
                {sentiment.net > 0 ? "+" : ""}
                <AnimatedNumber value={sentiment.net ?? 0} />
              </>
            ) : (
              "—"
            )}
          </span>
        }
        caption={sentiment ? `NPS-style net · ${sentiment.total.toLocaleString()} signals` : "loading"}
        footer={sentiment ? <NPSSplit sentiment={sentiment} /> : null}
      />
      <Tile
        icon={<Activity className="w-4 h-4" />}
        label="Queue"
        value={<AnimatedNumber value={queue} />}
        caption={queue > 0 ? `${pendingActionsCount} approvals, ${pendingFollowupsCount} follow-ups` : "all clear"}
        emphasis={queue > 0 ? "accent" : "default"}
      />
    </div>
  );
}

interface TileProps {
  label: string;
  value: React.ReactNode;
  caption?: string;
  icon?: React.ReactNode;
  emphasis?: "default" | "critical" | "accent";
  footer?: React.ReactNode;
}

function Tile({ label, value, caption, icon, emphasis = "default", footer }: TileProps) {
  const ring =
    emphasis === "critical"
      ? "ring-1 ring-risk-critical/30"
      : emphasis === "accent"
        ? "ring-1 ring-accent-500/30"
        : "";
  const iconTone =
    emphasis === "critical"
      ? "text-risk-critical"
      : emphasis === "accent"
        ? "text-accent-400"
        : "text-white/45";
  return (
    <div className={`glass-deep rounded-2xl px-5 py-4 ${ring}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/45">
        <span className={iconTone}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-[28px] font-semibold mt-1.5 leading-none tabular-nums">{value}</div>
      {caption && (
        <div className="text-[11px] text-white/45 mt-2 truncate">{caption}</div>
      )}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

function NPSSplit({ sentiment }: { sentiment: NonNullable<Props["sentiment"]> }) {
  const total = sentiment.total || 1;
  const p = (sentiment.positive / total) * 100;
  const n = (sentiment.neutral / total) * 100;
  const d = (sentiment.negative / total) * 100;
  return (
    <div className="flex h-1 rounded-full overflow-hidden bg-white/5">
      <div className="bg-risk-low" style={{ width: `${p}%` }} title={`Promoters: ${sentiment.positive}`} />
      <div className="bg-white/15" style={{ width: `${n}%` }} title={`Passives: ${sentiment.neutral}`} />
      <div className="bg-risk-critical" style={{ width: `${d}%` }} title={`Detractors: ${sentiment.negative}`} />
    </div>
  );
}

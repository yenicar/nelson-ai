"use client";

import { Customer, SentimentBreakdown } from "@/lib/types";
import { bandClass, fmtMoney, fmtPct } from "@/lib/format";
import { AlertCircle, ChevronRight, Mail, MessageCircle, Package, TrendingDown } from "lucide-react";
import { RiskGauge } from "./RiskGauge";
import { SentimentBar, sentimentTone } from "./SentimentBar";

interface Props {
  customer: Customer;
  sentiment?: SentimentBreakdown | null;
  onClick?: () => void;
  pinned?: boolean;
  /** featured = larger, more detail. standard = original. compact = strip. */
  tier?: "featured" | "standard" | "compact";
}

export function AccountCard({ customer: c, sentiment, onClick, pinned, tier = "standard" }: Props) {
  if (tier === "compact") {
    return (
      <button
        onClick={onClick}
        className={`glass glass-hover rounded-xl px-3 py-2 text-left flex items-center gap-2 ${
          pinned ? "ring-1 ring-accent-500/40" : ""
        }`}
      >
        <span className={bandClass(c.risk_band) + " flex-shrink-0"}>{c.risk_band || "—"}</span>
        <span className="text-sm text-white truncate flex-1">{c.customer_full_name}</span>
        <ChevronRight className="w-3 h-3 text-white/30 flex-shrink-0" />
      </button>
    );
  }

  const featured = tier === "featured";

  return (
    <button
      onClick={onClick}
      className={`glass glass-hover rounded-2xl text-left w-full ${
        featured ? "p-5" : "p-4"
      } ${pinned ? "ring-1 ring-accent-500/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className={`font-semibold text-white truncate ${featured ? "text-base" : "text-sm"}`}>
            {c.customer_full_name}
          </div>
          <div className="text-[11px] text-white/40 mt-0.5 truncate">
            {c.customer_segment || "—"}
            {c.customer_country ? ` · ${c.customer_country}` : ""}
          </div>
          <div className="mt-1.5">
            <span className={bandClass(c.risk_band)}>{c.risk_band || "—"}</span>
          </div>
        </div>
        <RiskGauge score={c.risk_score} band={c.risk_band} size={featured ? 44 : 38} />
      </div>

      {featured && c.churn_risk_reason && (
        <div className="text-xs text-white/65 mb-3 flex items-start gap-1.5">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2">{c.churn_risk_reason}</span>
        </div>
      )}

      <div className={`grid ${featured ? "grid-cols-3" : "grid-cols-2"} gap-2 text-xs`}>
        <Stat label="Revenue" value={fmtMoney(c.total_sales)} />
        <Stat
          label="Late"
          value={fmtPct(c.late_delivery_rate)}
          icon={<TrendingDown className="w-3 h-3" />}
        />
        {featured && (
          <Stat
            label="Open tix"
            value={String(c.open_support_ticket_count ?? 0)}
            icon={<Mail className="w-3 h-3" />}
          />
        )}
      </div>

      {sentiment && sentiment.total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <MessageCircle className="w-3 h-3 text-white/40 flex-shrink-0" />
          <SentimentBar data={sentiment} variant="compact" />
          <span className={`text-[10px] font-medium tabular-nums ${sentimentTone(sentiment.net)}`}>
            {sentiment.net > 0 ? "+" : ""}
            {sentiment.net}
          </span>
        </div>
      )}

      {featured && c.next_best_action && (
        <div className="mt-3 pt-3 border-t border-white/10 text-xs text-accent-400 flex items-center gap-1.5">
          <Package className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{c.next_best_action}</span>
        </div>
      )}
    </button>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-white/40 flex items-center gap-1 text-[10px] uppercase tracking-wide">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-white font-medium mt-0.5 text-sm">{value}</div>
    </div>
  );
}

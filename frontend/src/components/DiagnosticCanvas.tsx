"use client";

// Center of dashboard — Gartner level 2: DIAGNOSTIC.
// Cards grouped into lanes by primary concern. Each lane shows its top 3
// accounts as full cards plus a count of what's behind them — clicking
// through to the Customers view (planned) shows the rest. The previous
// chip tail made every lane feel cluttered regardless of spacing.

import { useMemo } from "react";
import { Customer, SentimentBreakdown } from "@/lib/types";
import { Lane, LANE_DESCRIPTIONS, LANE_LABELS, customerLane } from "@/lib/format";
import { AccountCard } from "./AccountCard";
import { ChevronRight } from "lucide-react";

interface Props {
  accounts: Customer[];
  sentiment?: Record<string, SentimentBreakdown>;
  onSelect: (customerId: string) => void;
  selectedId?: string | null;
}

const LANE_ORDER: Lane[] = ["open_tickets", "late_deliveries", "health_concerns", "watch_list"];

export function DiagnosticCanvas({ accounts, sentiment, onSelect, selectedId }: Props) {
  const grouped = useMemo(() => {
    const out: Record<Lane, Customer[]> = {
      open_tickets: [],
      late_deliveries: [],
      health_concerns: [],
      watch_list: [],
    };
    for (const c of accounts) out[customerLane(c)].push(c);
    return out;
  }, [accounts]);

  return (
    <div className="space-y-5">
      {LANE_ORDER.map((lane) => {
        const items = grouped[lane];
        if (items.length === 0) return null;
        return (
          <Lane
            key={lane}
            label={LANE_LABELS[lane]}
            description={LANE_DESCRIPTIONS[lane]}
            items={items}
            sentiment={sentiment}
            onSelect={onSelect}
            selectedId={selectedId}
          />
        );
      })}
    </div>
  );
}

function Lane({
  label,
  description,
  items,
  sentiment,
  onSelect,
  selectedId,
}: {
  label: string;
  description: string;
  items: Customer[];
  sentiment?: Record<string, SentimentBreakdown>;
  onSelect: (customerId: string) => void;
  selectedId?: string | null;
}) {
  const featured = items.slice(0, 3);
  const overflow = Math.max(0, items.length - 3);

  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white/90 tracking-wide">{label}</h2>
          <p className="text-xs text-white/40 mt-0.5">{description}</p>
        </div>
        <span className="text-xs text-white/40">
          {items.length} {items.length === 1 ? "account" : "accounts"}
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {featured.map((c, i) => (
          <div
            key={c.customer_id}
            className="stagger-in"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <AccountCard
              customer={c}
              sentiment={sentiment?.[c.customer_id]}
              tier="featured"
              pinned={selectedId === c.customer_id}
              onClick={() => onSelect(c.customer_id)}
            />
          </div>
        ))}
      </div>

      {overflow > 0 && (
        <div className="mt-2 flex items-center justify-end text-[11px] text-white/45">
          <span>+{overflow} more {overflow === 1 ? "account" : "accounts"} in this lane</span>
          <ChevronRight className="w-3 h-3 ml-1 opacity-60" />
        </div>
      )}
    </section>
  );
}

"use client";

// Center of dashboard — Gartner level 2: DIAGNOSTIC.
// Cards grouped into lanes by primary concern. Each lane shows its top 3
// featured cards by default; clicking the expand button reveals the rest
// of the lane inline as a flat 3-col grid.

import { useMemo, useState } from "react";
import { Customer, SentimentBreakdown } from "@/lib/types";
import { Lane, LANE_DESCRIPTIONS, LANE_LABELS, customerLane } from "@/lib/format";
import { AccountCard } from "./AccountCard";
import { ChevronDown } from "lucide-react";

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
          <LaneSection
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

function LaneSection({
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
  const [expanded, setExpanded] = useState(false);
  const featured = items.slice(0, 3);
  const rest = items.slice(3);
  const visible = expanded ? items : featured;

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
        {visible.map((c, i) => (
          <div
            key={c.customer_id}
            className="stagger-in"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <AccountCard
              customer={c}
              sentiment={sentiment?.[c.customer_id]}
              tier={i < 3 ? "featured" : "standard"}
              pinned={selectedId === c.customer_id}
              onClick={() => onSelect(c.customer_id)}
            />
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="glass glass-hover rounded-full px-4 py-1.5 text-xs font-medium text-white/75 hover:text-white flex items-center gap-1.5 transition"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronDown className="w-3.5 h-3.5 rotate-180 transition-transform" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 transition-transform" />
                Show {rest.length} more {rest.length === 1 ? "account" : "accounts"}
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}

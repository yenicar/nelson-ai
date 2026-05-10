"use client";

// Center of dashboard — Gartner level 2: DIAGNOSTIC.
// Cards grouped into lanes by primary concern. Tiered visual weight: top accounts
// in each lane render as full cards, the tail collapses to compact strips.

import { useMemo } from "react";
import { Customer } from "@/lib/types";
import { Lane, LANE_DESCRIPTIONS, LANE_LABELS, bandClass, customerLane, fmtMoney, fmtPct } from "@/lib/format";
import { AccountCard } from "./AccountCard";
import { ChevronRight } from "lucide-react";

interface Props {
  accounts: Customer[];
  onSelect: (customerId: string) => void;
  selectedId?: string | null;
}

const LANE_ORDER: Lane[] = ["open_tickets", "late_deliveries", "health_concerns", "watch_list"];

export function DiagnosticCanvas({ accounts, onSelect, selectedId }: Props) {
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
    <div className="space-y-6">
      {LANE_ORDER.map((lane) => {
        const items = grouped[lane];
        if (items.length === 0) return null;
        return (
          <Lane
            key={lane}
            label={LANE_LABELS[lane]}
            description={LANE_DESCRIPTIONS[lane]}
            items={items}
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
  onSelect,
  selectedId,
}: {
  label: string;
  description: string;
  items: Customer[];
  onSelect: (customerId: string) => void;
  selectedId?: string | null;
}) {
  // Tiered: top 3 = full cards; rest = compact strips
  const featured = items.slice(0, 3);
  const tail = items.slice(3);

  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white/90 tracking-wide">{label}</h2>
          <p className="text-xs text-white/40 mt-0.5">{description}</p>
        </div>
        <span className="text-xs text-white/40">{items.length} {items.length === 1 ? "account" : "accounts"}</span>
      </header>

      {featured.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          {featured.map((c, i) => (
            <div
              key={c.customer_id}
              className="stagger-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <AccountCard
                customer={c}
                tier="featured"
                pinned={selectedId === c.customer_id}
                onClick={() => onSelect(c.customer_id)}
              />
            </div>
          ))}
        </div>
      )}

      {tail.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {tail.map((c, i) => (
            <div
              key={c.customer_id}
              className="stagger-in"
              style={{ animationDelay: `${180 + i * 30}ms` }}
            >
              <CompactRow
                customer={c}
                pinned={selectedId === c.customer_id}
                onClick={() => onSelect(c.customer_id)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CompactRow({
  customer: c,
  onClick,
  pinned,
}: {
  customer: Customer;
  onClick?: () => void;
  pinned?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`glass glass-hover rounded-xl px-3 py-2.5 text-left flex items-center gap-2 ${
        pinned ? "ring-1 ring-accent-500/40" : ""
      }`}
    >
      <span className={bandClass(c.risk_band) + " flex-shrink-0"}>{(c.risk_band || "—").slice(0, 4)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{c.customer_full_name}</div>
        <div className="text-[10px] text-white/40 truncate">
          {fmtMoney(c.total_sales)} · {fmtPct(c.late_delivery_rate)} late
        </div>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
    </button>
  );
}

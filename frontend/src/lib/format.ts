// Display helpers — names + numbers + bands.

export function bandClass(band?: string | null): string {
  const b = (band || "").toLowerCase();
  if (b.includes("critical")) return "chip chip-critical";
  if (b.includes("high")) return "chip chip-high";
  if (b.includes("moderate") || b.includes("elevated")) return "chip chip-moderate";
  if (b.includes("low")) return "chip chip-low";
  return "chip chip-stable";
}

import type { Customer } from "./types";

/** Diagnostic lane — derive primary concern from customer signals. */
export type Lane = "open_tickets" | "late_deliveries" | "health_concerns" | "watch_list";

export const LANE_LABELS: Record<Lane, string> = {
  open_tickets: "Open critical tickets",
  late_deliveries: "Late delivery risk",
  health_concerns: "Health declining",
  watch_list: "Watch list",
};

export const LANE_DESCRIPTIONS: Record<Lane, string> = {
  open_tickets: "Customers with unresolved support tickets — service-recovery candidates.",
  late_deliveries: "Customers with elevated late-delivery rates — supply-chain pressure.",
  health_concerns: "Customers whose health score has dropped below 30 — churn watch.",
  watch_list: "Other accounts in the High/Critical bands — diagnostic review.",
};

export function customerLane(c: Customer): Lane {
  if ((c.open_support_ticket_count ?? 0) > 0) return "open_tickets";
  if ((c.late_delivery_rate ?? 0) > 0.5) return "late_deliveries";
  if ((c.health_score ?? 100) < 30) return "health_concerns";
  return "watch_list";
}

export function fmtMoney(n?: number | null): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function fmtPct(n?: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

export function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export function relativeDate(d?: string | null): string {
  if (!d) return "—";
  const date = new Date(d).getTime();
  const days = Math.round((Date.now() - date) / (1000 * 60 * 60 * 24));
  if (days < 0) return `in ${-days}d`;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

"use client";

// Unified chronological view of every interaction with a customer.
// Merges orders, tickets, notes, emails, fulfillment + engagement events,
// and reviews into a single sorted timeline.

import { useMemo } from "react";
import {
  AlertOctagon,
  FileText,
  Mail,
  Package,
  Truck,
  Activity,
  Eye,
  Flag,
} from "lucide-react";
import { fmtMoney, relativeDate } from "@/lib/format";

type EventKind =
  | "order"
  | "ticket"
  | "note"
  | "email"
  | "fulfillment"
  | "engagement"
  | "review";

interface TimelineItem {
  id: string;
  date: string;
  kind: EventKind;
  title: string;
  subtitle?: string;
  body?: string;
  badge?: string;
  badgeTone?: "critical" | "warn" | "ok" | "neutral";
}

const KIND_META: Record<EventKind, { icon: React.ReactNode; ringClass: string }> = {
  order: { icon: <Package className="w-3.5 h-3.5" />, ringClass: "bg-accent-500/15 text-accent-400" },
  ticket: { icon: <AlertOctagon className="w-3.5 h-3.5" />, ringClass: "bg-risk-high/15 text-risk-high" },
  note: { icon: <FileText className="w-3.5 h-3.5" />, ringClass: "bg-white/10 text-white/70" },
  email: { icon: <Mail className="w-3.5 h-3.5" />, ringClass: "bg-accent-500/15 text-accent-400" },
  fulfillment: { icon: <Truck className="w-3.5 h-3.5" />, ringClass: "bg-risk-moderate/15 text-risk-moderate" },
  engagement: { icon: <Activity className="w-3.5 h-3.5" />, ringClass: "bg-risk-low/15 text-risk-low" },
  review: { icon: <Eye className="w-3.5 h-3.5" />, ringClass: "bg-accent-500/15 text-accent-400" },
};

const BADGE_CLASS: Record<NonNullable<TimelineItem["badgeTone"]>, string> = {
  critical: "bg-risk-critical/20 text-risk-critical border-risk-critical/40",
  warn: "bg-risk-high/20 text-risk-high border-risk-high/40",
  ok: "bg-risk-low/20 text-risk-low border-risk-low/40",
  neutral: "bg-white/10 text-white/60 border-white/15",
};

interface Props {
  data: {
    orders: any[];
    tickets: any[];
    notes: any[];
    emails: any[];
    fulfillment: any[];
    engagement: any[];
    reviews?: any[];
  };
}

export function CustomerTimeline({ data }: Props) {
  const items = useMemo(() => buildTimeline(data), [data]);

  if (items.length === 0) {
    return <div className="text-white/40 text-sm italic">No activity recorded.</div>;
  }

  return (
    <div className="relative pl-1">
      {/* Vertical rail */}
      <div className="absolute left-[14px] top-2 bottom-2 w-px bg-white/8" />

      <ol className="space-y-3.5">
        {items.map((item) => {
          const meta = KIND_META[item.kind];
          return (
            <li key={item.id} className="relative pl-9">
              {/* Icon node */}
              <span
                className={`absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center ${meta.ringClass}`}
              >
                {meta.icon}
              </span>

              <div className="glass rounded-xl p-3 text-xs">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-[11px] text-white/50 mt-0.5 truncate">
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {item.badge && (
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                          BADGE_CLASS[item.badgeTone || "neutral"]
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    <span className="text-[10px] text-white/40 whitespace-nowrap">
                      {relativeDate(item.date)}
                    </span>
                  </div>
                </div>
                {item.body && (
                  <div className="text-white/65 mt-1.5 leading-relaxed line-clamp-3">
                    {item.body}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------- merge helpers ----------

function buildTimeline(data: Props["data"]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const o of data.orders || []) {
    if (!o.order_date) continue;
    const late = o.late_delivery_risk === 1 || o.delivery_status?.toLowerCase().includes("late");
    items.push({
      id: `o:${o.order_id}`,
      date: o.order_date,
      kind: "order",
      title: `Order ${o.order_id}`,
      subtitle: `${o.delivery_status || "—"} · ${fmtMoney(o.order_sales)}`,
      badge: late ? "Late" : undefined,
      badgeTone: late ? "warn" : undefined,
    });
  }

  for (const t of data.tickets || []) {
    if (!t.date_of_purchase) continue;
    const isCritical = (t.ticket_priority || "").toLowerCase() === "critical";
    const isOpen = !(t.ticket_status || "").toLowerCase().includes("closed");
    items.push({
      id: `t:${t.ticket_id}`,
      date: t.date_of_purchase,
      kind: "ticket",
      title: t.ticket_subject || t.ticket_type || "Support ticket",
      subtitle: `${t.ticket_priority || "?"} · ${t.ticket_status || "?"} · ${t.ticket_type || ""}`,
      body: t.ticket_description,
      badge: isCritical && isOpen ? "Critical · Open" : isCritical ? "Critical" : isOpen ? "Open" : undefined,
      badgeTone: isCritical && isOpen ? "critical" : isCritical ? "warn" : "neutral",
    });
  }

  for (const n of data.notes || []) {
    if (!n.note_date) continue;
    items.push({
      id: `n:${n.note_id}`,
      date: n.note_date,
      kind: "note",
      title: n.author || "Internal note",
      subtitle: `${n.scenario || ""}${n.topic ? " · " + n.topic : ""}`,
      body: n.note_text,
    });
  }

  for (const e of data.emails || []) {
    if (!e.date) continue;
    const dir = (e.direction || "").toLowerCase();
    const tone =
      (e.sentiment_hint || "").toLowerCase().includes("concerned") ||
      (e.sentiment_hint || "").toLowerCase().includes("frustrated")
        ? "warn"
        : (e.sentiment_hint || "").toLowerCase().includes("positive")
          ? "ok"
          : undefined;
    items.push({
      id: `e:${e.email_id}`,
      date: e.date,
      kind: "email",
      title: e.subject || "Email",
      subtitle: `${dir || "—"}${e.sentiment_hint ? " · " + e.sentiment_hint : ""}`,
      body: e.body,
      badge: e.sentiment_hint || undefined,
      badgeTone: tone,
    });
  }

  for (const f of data.fulfillment || []) {
    if (!f.event_date) continue;
    const sev = (f.severity || "").toLowerCase();
    items.push({
      id: `f:${f.fulfillment_event_id}`,
      date: f.event_date,
      kind: "fulfillment",
      title: f.event_type || "Fulfillment event",
      subtitle: `${f.severity || "—"} · ${f.root_cause || ""} · ${f.resolution_status || ""}`,
      badge: f.severity || undefined,
      badgeTone: sev === "high" ? "warn" : sev === "critical" ? "critical" : "neutral",
    });
  }

  for (const e of data.engagement || []) {
    if (!e.event_date) continue;
    items.push({
      id: `g:${e.engagement_id}`,
      date: e.event_date,
      kind: "engagement",
      title: e.event_type || "Engagement",
      subtitle: `${e.campaign || "—"} · ${e.channel || ""}`,
    });
  }

  for (const r of data.reviews || []) {
    if (!r.reviewed_at) continue;
    items.push({
      id: `r:${r.review_id}`,
      date: r.reviewed_at,
      kind: "review",
      title: `Reviewed by ${r.reviewer || "—"}`,
      subtitle: `Decision: ${r.human_decision || "—"} · ${r.scenario || ""}`,
      body: r.review_notes,
      badge: r.human_decision || undefined,
      badgeTone:
        r.human_decision === "Escalate"
          ? "critical"
          : r.human_decision === "Stabilize"
            ? "warn"
            : r.human_decision === "Monitor"
              ? "neutral"
              : undefined,
    });
  }

  return items.sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    return db - da;
  });
}

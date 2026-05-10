"use client";

import { useEffect, useState } from "react";
import { X, Mail, Package, AlertOctagon, Activity, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { Customer } from "@/lib/types";
import { bandClass, fmtMoney, fmtPct, relativeDate } from "@/lib/format";
import { CustomerTimeline } from "./CustomerTimeline";

interface Props {
  customerId: string | null;
  onClose: () => void;
}

export function AccountDrawer({ customerId, onClose }: Props) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getActivity>> | null>(null);
  const [tab, setTab] = useState<"summary" | "timeline" | "tickets" | "notes" | "emails" | "events">("summary");

  useEffect(() => {
    if (!customerId) {
      setData(null);
      return;
    }
    setData(null);
    api.getActivity(customerId).then(setData).catch(() => setData(null));
  }, [customerId]);

  if (!customerId) return null;
  const c: Customer | undefined = data?.customer;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[480px] glass-deep border-l border-white/10 flex flex-col animate-slide-up overflow-hidden">
      <header className="flex items-center justify-between px-6 py-5 border-b border-white/10">
        <div>
          {c ? (
            <>
              <div className="text-xl font-semibold">{c.customer_full_name}</div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={bandClass(c.risk_band)}>{c.risk_band || "—"}</span>
                <span className="text-xs text-white/40">{c.lifecycle_stage || "—"}</span>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="h-5 w-40 bg-white/10 rounded animate-pulse-soft" />
              <div className="h-3 w-24 bg-white/8 rounded animate-pulse-soft" />
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white/100 transition">
          <X className="w-5 h-5" />
        </button>
      </header>

      {c && (
        <>
          <nav className="flex border-b border-white/10 px-2 gap-0.5">
            {(["summary", "timeline", "tickets", "notes", "emails", "events"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2.5 text-xs uppercase tracking-wider transition ${
                  tab === t
                    ? "text-white border-b-2 border-accent-500"
                    : "text-white/40 hover:text-white/70 border-b-2 border-transparent"
                }`}
              >
                {t === "timeline" && <Clock className="w-3 h-3 inline -mt-0.5 mr-1" />}
                {t}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
            {tab === "summary" && <SummaryTab customer={c} data={data!} />}
            {tab === "timeline" && <CustomerTimeline data={data!} />}
            {tab === "tickets" && <ListTab items={data!.tickets} kind="ticket" />}
            {tab === "notes" && <ListTab items={data!.notes} kind="note" />}
            {tab === "emails" && <ListTab items={data!.emails} kind="email" />}
            {tab === "events" && <EventsTab data={data!} />}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTab({ customer: c, data }: { customer: Customer; data: any }) {
  return (
    <div className="space-y-5">
      {c.churn_risk_reason && (
        <Block icon={<AlertOctagon className="w-4 h-4 text-risk-high" />} title="Why this is on the radar">
          {c.churn_risk_reason}
        </Block>
      )}
      {c.next_best_action && (
        <Block icon={<Package className="w-4 h-4 text-accent-400" />} title="Next best action">
          {c.next_best_action}
        </Block>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Revenue" value={fmtMoney(c.total_sales)} />
        <Stat label="Profit" value={fmtMoney(c.total_profit)} />
        <Stat label="Total orders" value={String(c.total_orders ?? 0)} />
        <Stat label="Late delivery rate" value={fmtPct(c.late_delivery_rate)} />
        <Stat label="Support tickets" value={String(c.support_ticket_count ?? 0)} />
        <Stat label="Open tickets" value={String(c.open_support_ticket_count ?? 0)} />
        <Stat label="Risk score" value={`${c.risk_score ?? 0}/100`} />
        <Stat label="Health score" value={`${c.health_score ?? 0}/100`} />
      </div>

      <Block icon={<Activity className="w-4 h-4 text-accent-400" />} title="Recent activity">
        <div className="text-xs space-y-0.5">
          <div>Orders: {data.orders.length} · Tickets: {data.tickets.length}</div>
          <div>Notes: {data.notes.length} · Emails: {data.emails.length}</div>
          <div>Reviews: {data.reviews.length} · Events: {data.fulfillment.length + data.engagement.length}</div>
        </div>
      </Block>
    </div>
  );
}

function ListTab({ items, kind }: { items: any[]; kind: "ticket" | "note" | "email" }) {
  if (items.length === 0) {
    return <div className="text-white/40 text-sm">Nothing here.</div>;
  }
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.ticket_id || it.note_id || it.email_id} className="glass rounded-xl p-3 text-xs">
          {kind === "ticket" && (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-white">{it.ticket_subject}</span>
                <span className="text-white/40 text-[10px]">{relativeDate(it.date_of_purchase)}</span>
              </div>
              <div className="text-white/50 text-[11px]">
                {it.ticket_priority} · {it.ticket_status} · {it.ticket_type}
              </div>
              {it.ticket_description && (
                <div className="text-white/70 mt-2 line-clamp-2">{it.ticket_description}</div>
              )}
            </>
          )}
          {kind === "note" && (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-white">{it.author || "—"}</span>
                <span className="text-white/40 text-[10px]">{relativeDate(it.note_date)}</span>
              </div>
              <div className="text-white/70 mt-1">{it.note_text}</div>
              <div className="text-white/30 text-[10px] mt-2">
                {it.scenario} · {it.topic}
              </div>
            </>
          )}
          {kind === "email" && (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-white">{it.subject || "—"}</span>
                <span className="text-white/40 text-[10px]">{relativeDate(it.date)}</span>
              </div>
              <div className="text-white/70 mt-1 line-clamp-3">{it.body}</div>
              <div className="text-white/30 text-[10px] mt-2">
                {it.direction} · sentiment: {it.sentiment_hint || "—"}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function EventsTab({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Fulfillment events</div>
        {data.fulfillment.length === 0 ? (
          <div className="text-white/40 text-sm">No fulfillment events.</div>
        ) : (
          <div className="space-y-1.5">
            {data.fulfillment.map((f: any) => (
              <div key={f.fulfillment_event_id} className="glass rounded-lg px-3 py-2 text-xs flex justify-between">
                <span className="text-white/100">{f.event_type} · {f.severity}</span>
                <span className="text-white/40">{relativeDate(f.event_date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Engagement events</div>
        {data.engagement.length === 0 ? (
          <div className="text-white/40 text-sm">No engagement events.</div>
        ) : (
          <div className="space-y-1.5">
            {data.engagement.slice(0, 12).map((e: any) => (
              <div key={e.engagement_id} className="glass rounded-lg px-3 py-2 text-xs flex justify-between">
                <span className="text-white/100">{e.event_type} · {e.channel}</span>
                <span className="text-white/40">{relativeDate(e.event_date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Block({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <div className="text-xs uppercase tracking-wider text-white/50">{title}</div>
      </div>
      <div className="text-sm text-white/105">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-sm text-white font-medium mt-1">{value}</div>
    </div>
  );
}

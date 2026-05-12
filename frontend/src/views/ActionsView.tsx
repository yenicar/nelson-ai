"use client";

// Dedicated workspace for Nelson's drafted actions — both pending (awaiting
// your approval) and decided (audit trail). Richer than the right-rail slice:
// full email body, full rationale, filter by action_type.

import { useEffect, useMemo, useState } from "react";
import { Check, History, Loader2, Pencil, Save, Send, Sparkles, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { DecidedAction, PendingAction } from "@/lib/types";
import { relativeDate } from "@/lib/format";
import { useToast } from "@/lib/toast";

type Tab = "pending" | "decided";

interface Props {
  initialTab: Tab;
  onSelect: (customerId: string) => void;
}

export function ActionsView({ initialTab, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pending, setPending] = useState<PendingAction[] | null>(null);
  const [decided, setDecided] = useState<DecidedAction[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => setTab(initialTab), [initialTab]);

  useEffect(() => {
    api.pendingActions().then(setPending).catch(() => setPending([]));
  }, [refreshTick]);

  useEffect(() => {
    if (tab !== "decided" && decided !== null) return;
    api.decidedActions(50).then(setDecided).catch(() => setDecided([]));
  }, [tab, refreshTick, decided]);

  const list = tab === "pending" ? pending : decided;
  const allTypes = useMemo(() => {
    const set = new Set<string>();
    for (const a of list ?? []) set.add(a.action_type);
    return Array.from(set).sort();
  }, [list]);

  const filtered = useMemo(() => {
    if (!list) return [];
    return typeFilter ? list.filter((a) => a.action_type === typeFilter) : list;
  }, [list, typeFilter]);

  function refresh() {
    setRefreshTick((t) => t + 1);
    setDecided(null); // force refetch of decided too
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 gap-4">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            {tab === "pending" ? "Awaiting approval" : "Audit trail"}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {tab === "pending" ? "Nelson's pending actions" : "Decisions you've made"}
          </h2>
        </div>
        <div className="text-xs text-white/50">
          {list === null ? "Loading…" : `${filtered.length} ${tab}`}
        </div>
      </div>

      {/* Tabs + type filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <TabPill active={tab === "pending"} onClick={() => setTab("pending")} icon={<Sparkles className="w-3.5 h-3.5" />}>
            Pending {pending && <span className="ml-1 text-white/50">{pending.length}</span>}
          </TabPill>
          <TabPill active={tab === "decided"} onClick={() => setTab("decided")} icon={<History className="w-3.5 h-3.5" />}>
            Decided {decided && <span className="ml-1 text-white/50">{decided.length}</span>}
          </TabPill>
        </div>
        {allTypes.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-white/30 mr-1">Filter</span>
            <button
              onClick={() => setTypeFilter(null)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition border ${
                typeFilter === null
                  ? "bg-accent-500/20 text-accent-400 border-accent-500/40"
                  : "bg-white/5 text-white/55 border-white/10 hover:bg-white/10"
              }`}
            >
              All
            </button>
            {allTypes.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition border ${
                  typeFilter === t
                    ? "bg-accent-500/20 text-accent-400 border-accent-500/40"
                    : "bg-white/5 text-white/55 border-white/10 hover:bg-white/10"
                }`}
              >
                {t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Card list */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-1 -mr-1">
        {list === null ? (
          <div className="text-white/40 text-sm text-center py-12 animate-pulse-soft">
            Loading {tab} actions…
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="text-white/30 text-3xl mb-2">∅</div>
            <div className="text-sm text-white/55">
              {tab === "pending"
                ? "Nothing waiting on you. When Nelson drafts an action, it'll appear here."
                : "No decisions recorded yet."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map((a) =>
              tab === "pending" ? (
                <PendingCard
                  key={a.action_id}
                  action={a as PendingAction}
                  onSelect={onSelect}
                  onDecided={refresh}
                />
              ) : (
                <DecidedCard
                  key={a.action_id}
                  action={a as DecidedAction}
                  onSelect={onSelect}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabPill({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
        active
          ? "bg-accent-500/15 text-white border-accent-500/40"
          : "bg-white/5 text-white/55 border-white/10 hover:bg-white/10 hover:text-white"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function PendingCard({
  action,
  onSelect,
  onDecided,
}: {
  action: PendingAction;
  onSelect: (customerId: string) => void;
  onDecided: () => void;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const toast = useToast();

  // Parse current payload + maintain local editable copy
  const parsedPayload = useMemo<Record<string, unknown>>(() => {
    try {
      return action.payload_json ? JSON.parse(action.payload_json) : {};
    } catch {
      return {};
    }
  }, [action.payload_json]);

  const [draftTo, setDraftTo] = useState((parsedPayload.to as string) || "");
  const [draftSubject, setDraftSubject] = useState((parsedPayload.subject as string) || "");
  const [draftBody, setDraftBody] = useState(
    (parsedPayload.body as string) ||
      (parsedPayload.text as string) ||
      (parsedPayload.message as string) ||
      "",
  );

  const isEmail = action.action_type === "send_email";
  const to = (parsedPayload.to as string) || "";
  const subject = (parsedPayload.subject as string) || "";
  const body =
    (parsedPayload.body as string) ||
    (parsedPayload.text as string) ||
    (parsedPayload.message as string) ||
    "";

  async function decide(verb: "approve" | "reject") {
    setBusy(verb);
    setError(null);
    try {
      const result =
        verb === "approve"
          ? await api.approveAction(action.action_id)
          : await api.rejectAction(action.action_id);

      if (verb === "approve" && isEmail && result.sent) {
        toast.push({
          kind: "success",
          title: `📧 Sent to ${result.sent_to}`,
          body: `Subject: ${subject || "(no subject)"}`,
        });
      } else if (verb === "approve" && isEmail && result.send_error) {
        toast.push({
          kind: "info",
          title: "Approved — not sent",
          body: result.send_error.slice(0, 120),
        });
      } else {
        toast.push({
          kind: verb === "approve" ? "success" : "info",
          title: `${verb === "approve" ? "Approved" : "Rejected"}: ${action.action_type.replace(/_/g, " ")}`,
          body: action.customer_full_name || undefined,
        });
      }
      onDecided();
    } catch (e) {
      const msg = e instanceof ApiError ? e.body || e.message : String(e);
      setError(msg);
      toast.push({ kind: "error", title: "Action failed", body: msg });
      setBusy(null);
    }
  }

  async function saveEdit() {
    setBusy("save");
    setError(null);
    try {
      const newPayload = {
        ...parsedPayload,
        to: draftTo,
        subject: draftSubject,
        body: draftBody,
      };
      await api.editActionPayload(action.action_id, newPayload);
      toast.push({ kind: "success", title: "Draft updated", body: action.customer_full_name || undefined });
      setEditing(false);
      onDecided(); // refresh list to pick up new content
    } catch (e) {
      const msg = e instanceof ApiError ? e.body || e.message : String(e);
      setError(msg);
      toast.push({ kind: "error", title: "Save failed", body: msg });
    } finally {
      setBusy(null);
    }
  }

  function cancelEdit() {
    setDraftTo((parsedPayload.to as string) || "");
    setDraftSubject((parsedPayload.subject as string) || "");
    setDraftBody(
      (parsedPayload.body as string) ||
        (parsedPayload.text as string) ||
        (parsedPayload.message as string) ||
        "",
    );
    setEditing(false);
    setError(null);
  }

  return (
    <div className="glass-deep rounded-2xl border border-accent-500/20 overflow-hidden flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <button
            onClick={() => onSelect(action.customer_id)}
            className="text-left flex-1 min-w-0"
          >
            <div className="text-base font-semibold text-white truncate">
              {action.customer_full_name || "—"}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-accent-400 font-semibold mt-0.5">
              {action.action_type.replace(/_/g, " ")}
              {editing && <span className="ml-2 text-white/40 normal-case tracking-normal">· editing</span>}
            </div>
          </button>
          {action.confidence != null && !editing && (
            <span className="text-[10px] font-medium text-white/40 flex-shrink-0">
              {Math.round(action.confidence * 100)}% confident
            </span>
          )}
        </div>

        {action.nelson_rationale && !editing && (
          <div className="text-xs text-white/70 italic mb-3">{action.nelson_rationale}</div>
        )}

        {/* Edit mode: inline form for email fields */}
        {editing && isEmail ? (
          <div className="space-y-2.5">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">To</label>
              <input
                type="text"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                placeholder="recipient@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent-500/60"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Subject</label>
              <input
                type="text"
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent-500/60"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Body</label>
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={8}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent-500/60 leading-relaxed font-sans resize-none"
              />
            </div>
          </div>
        ) : (
          (to || subject || body) && (
            <div className="bg-white/5 rounded-lg px-3 py-2.5 text-xs text-white/80 max-h-40 overflow-y-auto scrollbar-thin">
              {to && (
                <div className="text-white/45 mb-1">
                  <span className="font-mono text-[10px]">To:</span> {to}
                </div>
              )}
              {subject && <div className="font-medium text-white/90 mb-1">{subject}</div>}
              {body && <div className="whitespace-pre-wrap leading-relaxed">{body}</div>}
              {!to && !subject && !body && (
                <pre className="text-[10px] font-mono text-white/55 overflow-x-auto">
                  {JSON.stringify(parsedPayload, null, 2)}
                </pre>
              )}
            </div>
          )
        )}

        {!editing && (
          <div className="text-[10px] text-white/35 mt-2">
            Drafted {relativeDate(action.created_at)}
          </div>
        )}
      </div>

      {/* Action buttons — edit mode vs default */}
      {editing ? (
        <div className="flex border-t border-white/10">
          <button
            onClick={saveEdit}
            disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-accent-400 hover:bg-accent-500/10 transition border-r border-white/10 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save draft
          </button>
          <button
            onClick={cancelEdit}
            disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5 transition disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex border-t border-white/10">
          <button
            onClick={() => decide("approve")}
            disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-risk-low hover:bg-risk-low/10 transition border-r border-white/10 disabled:opacity-50"
          >
            {busy === "approve" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isEmail ? (
              <Send className="w-3.5 h-3.5" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {isEmail ? "Approve & send" : "Approve"}
          </button>
          {isEmail && (
            <button
              onClick={() => setEditing(true)}
              disabled={!!busy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-accent-400 hover:bg-accent-500/10 transition border-r border-white/10 disabled:opacity-50"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
          <button
            onClick={() => decide("reject")}
            disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5 transition disabled:opacity-50"
          >
            {busy === "reject" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
            Reject
          </button>
        </div>
      )}
      {error && (
        <div className="px-3 py-1.5 text-[10px] text-risk-critical border-t border-risk-critical/30 bg-risk-critical/5">
          {error}
        </div>
      )}
    </div>
  );
}

function DecidedCard({
  action,
  onSelect,
}: {
  action: DecidedAction;
  onSelect: (customerId: string) => void;
}) {
  const approved = action.status === "approved";
  const sent = approved && !!action.sent_at;
  const sendFailed = approved && !sent && !!action.send_error;
  let payload: Record<string, unknown> = {};
  try {
    payload = action.payload_json ? JSON.parse(action.payload_json) : {};
  } catch {
    /* ignore */
  }
  const subject = (payload.subject as string) || "";
  const to = (payload.to as string) || "";
  const bodyPreview =
    ((payload.body as string) ||
      (payload.text as string) ||
      (payload.message as string) ||
      "").slice(0, 240);

  const badge = sent
    ? { text: "📧 SENT", cls: "bg-accent-500/15 text-accent-400 border-accent-500/30" }
    : approved
      ? sendFailed
        ? { text: "✓ APPROVED · not sent", cls: "bg-risk-moderate/15 text-risk-moderate border-risk-moderate/30" }
        : { text: "✓ APPROVED", cls: "bg-risk-low/15 text-risk-low border-risk-low/30" }
      : { text: "✗ REJECTED", cls: "bg-white/5 text-white/55 border-white/10" };

  return (
    <button
      onClick={() => onSelect(action.customer_id)}
      className={`glass rounded-2xl p-4 text-left transition border ${
        sent
          ? "border-accent-500/20 hover:border-accent-500/40"
          : approved
            ? "border-risk-low/20 hover:border-risk-low/40"
            : "border-white/10 hover:border-white/20 opacity-80"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">
            {action.customer_full_name || "—"}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-accent-400 font-medium mt-0.5">
            {action.action_type.replace(/_/g, " ")}
          </div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0 border ${badge.cls}`}>
          {badge.text}
        </span>
      </div>
      {action.nelson_rationale && (
        <div className="text-[11px] text-white/60 italic mb-1.5 line-clamp-2">
          {action.nelson_rationale}
        </div>
      )}
      {(subject || bodyPreview) && (
        <div className="bg-white/3 rounded px-2 py-1.5 text-[11px] text-white/65 mb-2 max-h-20 overflow-hidden">
          {to && <div className="text-white/40 text-[10px]">To: {to}</div>}
          {subject && <div className="font-medium text-white/80">{subject}</div>}
          {bodyPreview && <div className="line-clamp-2">{bodyPreview}</div>}
        </div>
      )}
      {sendFailed && action.send_error && (
        <div className="text-[10px] text-risk-moderate/90 mb-1.5 line-clamp-1">
          ⚠️ {action.send_error}
        </div>
      )}
      <div className="flex items-center justify-between text-[10px] text-white/35">
        <span>by {action.decided_by || "—"}</span>
        <span>
          {sent
            ? `sent ${relativeDate(action.sent_at)}`
            : relativeDate(action.decided_at)}
        </span>
      </div>
    </button>
  );
}

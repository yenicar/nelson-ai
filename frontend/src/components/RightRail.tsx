"use client";

// Right rail — Gartner levels 3 + 4: PREDICTIVE + PRESCRIPTIVE.
//   Top half:    pending follow-ups (predictive — "these will need attention")
//   Bottom half: Nelson's pending actions + decided audit trail (prescriptive)

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Clock, History, Loader2, Sparkles, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { DecidedAction, PendingAction, PendingFollowup } from "@/lib/types";
import { bandClass, relativeDate } from "@/lib/format";

interface Props {
  followups: PendingFollowup[];
  actions: PendingAction[];
  onSelect: (customerId: string) => void;
  onActionDecided: () => void;
}

export function RightRail({ followups, actions, onSelect, onActionDecided }: Props) {
  return (
    <aside className="h-full flex flex-col gap-3">
      <PredictivePanel followups={followups} onSelect={onSelect} />
      <PrescriptivePanel actions={actions} onSelect={onSelect} onDecided={onActionDecided} />
    </aside>
  );
}

// ---------- Predictive ----------

function PredictivePanel({
  followups,
  onSelect,
}: {
  followups: PendingFollowup[];
  onSelect: (customerId: string) => void;
}) {
  return (
    <div className="glass-deep rounded-2xl p-4 flex-1 min-h-0 flex flex-col">
      <header className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">Predictive</div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-risk-moderate" />
            Pending follow-ups
          </div>
        </div>
        <span className="text-xs text-white/40">{followups.length}</span>
      </header>
      <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 -mr-1 space-y-1.5">
        {followups.length === 0 && (
          <div className="text-xs text-white/40 italic px-1 py-2">
            No reviews awaiting follow-up.
          </div>
        )}
        {followups.map((f) => (
          <button
            key={f.review_id}
            onClick={() => onSelect(f.customer_id)}
            className="w-full glass glass-hover rounded-lg p-2.5 text-left"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-sm font-medium text-white truncate">{f.customer_full_name}</div>
              {f.risk_band && <span className={bandClass(f.risk_band) + " flex-shrink-0"}>{f.risk_band}</span>}
            </div>
            <div className="text-[10px] text-white/50 line-clamp-1">
              {f.scenario || "—"} · last review {relativeDate(f.reviewed_at)}
            </div>
            {f.next_best_action && (
              <div className="text-[10px] text-accent-400 mt-1 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />
                <span className="truncate">{f.next_best_action}</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Prescriptive ----------

function PrescriptivePanel({
  actions,
  onSelect,
  onDecided,
}: {
  actions: PendingAction[];
  onSelect: (customerId: string) => void;
  onDecided: () => void;
}) {
  const [tab, setTab] = useState<"pending" | "decided">("pending");
  const [decided, setDecided] = useState<DecidedAction[] | null>(null);
  const [loadingDecided, setLoadingDecided] = useState(false);

  // Fetch the audit trail when the user switches to "Decided".
  useEffect(() => {
    if (tab !== "decided") return;
    setLoadingDecided(true);
    api
      .decidedActions(30)
      .then(setDecided)
      .catch(() => setDecided([]))
      .finally(() => setLoadingDecided(false));
  }, [tab, actions.length]); // refresh after any new decision

  return (
    <div className="glass-deep rounded-2xl p-4 flex-1 min-h-0 flex flex-col">
      <header className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-white/40">Prescriptive</div>
        <div className="text-sm font-semibold flex items-center gap-1.5 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-accent-400" />
          Nelson's actions
        </div>
        <div className="flex items-center gap-1 text-xs">
          <TabButton active={tab === "pending"} onClick={() => setTab("pending")}>
            <Sparkles className="w-3 h-3" /> Pending
            <span className="ml-1 text-white/50">{actions.length}</span>
          </TabButton>
          <TabButton active={tab === "decided"} onClick={() => setTab("decided")}>
            <History className="w-3 h-3" /> Decided
            {decided && <span className="ml-1 text-white/50">{decided.length}</span>}
          </TabButton>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 -mr-1 space-y-2">
        {tab === "pending" && actions.length === 0 && (
          <div className="text-xs text-white/40 italic px-1 py-2 leading-relaxed">
            Nothing waiting on you. When Nelson drafts an action, it'll land here for approval.
          </div>
        )}
        {tab === "pending" &&
          actions.map((a) => (
            <ActionRow key={a.action_id} action={a} onSelect={onSelect} onDecided={onDecided} />
          ))}

        {tab === "decided" && loadingDecided && (
          <div className="text-xs text-white/40 italic px-1 py-2 animate-pulse-soft">
            Loading audit trail…
          </div>
        )}
        {tab === "decided" && !loadingDecided && decided && decided.length === 0 && (
          <div className="text-xs text-white/40 italic px-1 py-2 leading-relaxed">
            No decisions yet. Approve or reject a pending action and it'll show here.
          </div>
        )}
        {tab === "decided" &&
          !loadingDecided &&
          decided &&
          decided.map((a) => (
            <DecidedRow key={a.action_id} action={a} onSelect={onSelect} />
          ))}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
        active
          ? "bg-accent-500/20 text-accent-400 border border-accent-500/30"
          : "text-white/50 hover:text-white/80 border border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

function DecidedRow({
  action,
  onSelect,
}: {
  action: DecidedAction;
  onSelect: (customerId: string) => void;
}) {
  const isApproved = action.status === "approved";
  return (
    <button
      onClick={() => onSelect(action.customer_id)}
      className="w-full glass rounded-lg p-2.5 text-left"
    >
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <div className="text-sm font-medium text-white truncate flex-1">
          {action.customer_full_name || "—"}
        </div>
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
            isApproved
              ? "bg-risk-low/15 text-risk-low border border-risk-low/30"
              : "bg-white/5 text-white/50 border border-white/10"
          }`}
        >
          {isApproved ? "✓ Approved" : "✗ Rejected"}
        </span>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-accent-400 mb-1">
        {action.action_type.replace(/_/g, " ")}
      </div>
      {action.nelson_rationale && (
        <div className="text-[11px] text-white/60 line-clamp-1 mb-1">
          {action.nelson_rationale}
        </div>
      )}
      <div className="text-[10px] text-white/35 flex items-center gap-2">
        <span>by {action.decided_by || "—"}</span>
        <span>·</span>
        <span>{relativeDate(action.decided_at)}</span>
      </div>
    </button>
  );
}

function ActionRow({
  action,
  onSelect,
  onDecided,
}: {
  action: PendingAction;
  onSelect: (customerId: string) => void;
  onDecided: () => void;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "approve") await api.approveAction(action.action_id);
      else await api.rejectAction(action.action_id);
      onDecided();
    } catch (e) {
      setError(e instanceof ApiError ? e.body || e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <div className="glass rounded-lg p-2.5">
      <div className="flex items-start justify-between gap-2 mb-1">
        <button onClick={() => onSelect(action.customer_id)} className="text-left flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{action.customer_full_name || "—"}</div>
          <div className="text-[10px] uppercase tracking-wider text-accent-400 mt-0.5">
            {action.action_type.replace(/_/g, " ")}
          </div>
        </button>
        {action.confidence != null && (
          <span className="text-[10px] text-white/40 mt-0.5 flex-shrink-0">
            {Math.round(action.confidence * 100)}%
          </span>
        )}
      </div>
      {action.nelson_rationale && (
        <div className="text-[11px] text-white/65 mb-2 line-clamp-2">{action.nelson_rationale}</div>
      )}
      <div className="flex gap-1.5">
        <button
          onClick={() => decide("approve")}
          disabled={!!busy}
          className="flex-1 text-[11px] font-medium bg-risk-low/15 hover:bg-risk-low/25 disabled:opacity-50 text-risk-low border border-risk-low/30 rounded px-2 py-1 flex items-center justify-center gap-1 transition"
        >
          {busy === "approve" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Approve
        </button>
        <button
          onClick={() => decide("reject")}
          disabled={!!busy}
          className="flex-1 text-[11px] font-medium bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white/60 border border-white/10 rounded px-2 py-1 flex items-center justify-center gap-1 transition"
        >
          {busy === "reject" ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          Reject
        </button>
      </div>
      {error && <div className="text-[10px] text-risk-critical mt-1">{error}</div>}
    </div>
  );
}

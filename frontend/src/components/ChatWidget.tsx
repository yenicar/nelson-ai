"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { PendingAction, TraceStep } from "@/lib/types";

interface Msg {
  role: "user" | "assistant";
  content: string;
  trace?: TraceStep[];
  actions?: PendingAction[];
}

const SUGGESTIONS = [
  "Give me the morning brief",
  "Who are my top 3 at-risk customers?",
  "What's the status on Mary Brady?",
  "Draft a service-recovery email for Mary Brady",
];

// ----- Tool name → emoji + human label -----
const TOOL_META: Record<string, { emoji: string; label: string }> = {
  find_customer: { emoji: "🔎", label: "Looking up customer" },
  get_customers_by_ids: { emoji: "🔎", label: "Resolving customer IDs" },
  get_customer_profile: { emoji: "👤", label: "Fetching profile" },
  get_recent_orders: { emoji: "📦", label: "Pulling recent orders" },
  get_recent_tickets: { emoji: "🎫", label: "Pulling recent tickets" },
  get_recent_notes: { emoji: "📝", label: "Reading internal notes" },
  get_recent_emails: { emoji: "✉️", label: "Reading emails" },
  get_engagement_events: { emoji: "📊", label: "Checking engagement" },
  get_fulfillment_issues: { emoji: "🚚", label: "Checking fulfillment" },
  get_top_at_risk: { emoji: "⚠️", label: "Ranking at-risk customers" },
  get_top_by_revenue: { emoji: "💰", label: "Ranking by revenue" },
  search_customers_by_prefix: { emoji: "🔠", label: "Searching by prefix" },
  get_portfolio_summary: { emoji: "📈", label: "Reading portfolio summary" },
  get_pending_review_outcomes: { emoji: "⏳", label: "Listing pending follow-ups" },
  propose_action: { emoji: "✍️", label: "Drafting action for approval" },
};

function toolMeta(name: string) {
  return TOOL_META[name] ?? { emoji: "🔧", label: name.replace(/_/g, " ") };
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live trace for the in-flight turn
  const [liveTrace, setLiveTrace] = useState<TraceStep[]>([]);
  const traceRef = useRef<TraceStep[]>([]);
  // Action IDs Nelson drafted during this turn — fetched and attached to the
  // assistant message when the stream completes.
  const draftedActionIdsRef = useRef<string[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, liveTrace]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setBusy(true);
    traceRef.current = [];
    draftedActionIdsRef.current = [];
    setLiveTrace([]);

    let finalText = "";
    try {
      await api.streamChat(trimmed, sessionId, (event) => {
        if (event.type === "session") {
          setSessionId(event.session_id);
        } else if (event.type === "tool_call") {
          traceRef.current = [
            ...traceRef.current,
            { name: event.name, args: event.args },
          ];
          setLiveTrace([...traceRef.current]);
        } else if (event.type === "tool_result") {
          // Attach summary to the most recent matching tool call
          const next = [...traceRef.current];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].name === event.name && !next[i].summary) {
              next[i] = { ...next[i], summary: event.summary };
              break;
            }
          }
          traceRef.current = next;
          setLiveTrace([...next]);
        } else if (event.type === "action_drafted") {
          draftedActionIdsRef.current.push(event.action_id);
        } else if (event.type === "message") {
          finalText = event.content;
        } else if (event.type === "error") {
          setError(event.message);
        }
      });

      // Fetch any actions Nelson drafted during this turn so we can render
      // them inline in the assistant's message bubble.
      let inlineActions: PendingAction[] = [];
      if (draftedActionIdsRef.current.length > 0) {
        inlineActions = (
          await Promise.all(
            draftedActionIdsRef.current.map((id) =>
              api.getAction(id).catch(() => null),
            ),
          )
        ).filter((a): a is PendingAction => a !== null);
      }

      // Stream complete — commit the assistant message
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: finalText || "(no response)",
          trace: traceRef.current.length ? [...traceRef.current] : undefined,
          actions: inlineActions.length ? inlineActions : undefined,
        },
      ]);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 503
            ? "GEMINI_API_KEY isn't configured. Add it to .env and restart the backend."
            : err.body || err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
      setError(msg);
    } finally {
      setBusy(false);
      setLiveTrace([]);
      traceRef.current = [];
      draftedActionIdsRef.current = [];
    }
  }

  // Approve/reject an inline action and update the message bubble in place.
  function updateAction(messageIndex: number, actionId: string, status: string) {
    setMessages((m) => {
      const next = [...m];
      const target = next[messageIndex];
      if (!target?.actions) return m;
      target.actions = target.actions.map((a) =>
        a.action_id === actionId ? { ...a, status } : a,
      );
      return next;
    });
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 glass-deep rounded-full p-4 hover:scale-105 transition shadow-glass-deep"
          aria-label="Open Nelson chat"
        >
          <MessageCircle className="w-5 h-5 text-accent-400" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-risk-low rounded-full ring-2 ring-ink-900 animate-pulse-soft" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[640px] glass-deep rounded-3xl flex flex-col animate-slide-up overflow-hidden">
          <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 bg-risk-low rounded-full animate-pulse-soft" />
              <div>
                <div className="font-semibold text-sm">Nelson</div>
                <div className="text-xs text-white/40">AI Account Manager</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white/80 transition">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin">
            {messages.length === 0 && !busy && (
              <div className="space-y-3 animate-fade-in">
                <div className="text-sm text-white/65 leading-relaxed">
                  Hey — I'm Nelson. Ask me anything about your portfolio. You'll see
                  me work in real time below.
                </div>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full text-left text-xs glass rounded-lg px-3 py-2 hover:bg-white/10 transition text-white/70"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                msg={m}
                onActionDecided={(actionId, status) => updateAction(i, actionId, status)}
              />
            ))}

            {/* In-flight turn */}
            {busy && (
              <div className="mr-6 space-y-2 animate-fade-in">
                <TracePanel steps={liveTrace} live />
                {liveTrace.length === 0 && (
                  <div className="glass rounded-2xl rounded-tl-sm px-4 py-2.5 text-white/60 text-sm flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Nelson is thinking…
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="text-xs text-risk-critical bg-risk-critical/10 border border-risk-critical/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="p-3 border-t border-white/10 flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Nelson…"
              disabled={busy}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent-500/60 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="bg-accent-500 hover:bg-accent-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl px-3 transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// ---------- Sub-components ----------

function MessageBubble({
  msg,
  onActionDecided,
}: {
  msg: Msg;
  onActionDecided: (actionId: string, status: string) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="ml-8 bg-accent-500/15 border border-accent-500/30 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed">
        {msg.content}
      </div>
    );
  }
  return (
    <div className="mr-6 space-y-2">
      {msg.trace && msg.trace.length > 0 && <TracePanel steps={msg.trace} live={false} />}
      <div className="glass rounded-2xl rounded-tl-sm px-4 py-2.5 text-white/90 text-sm leading-relaxed whitespace-pre-wrap">
        {msg.content}
      </div>
      {msg.actions?.map((a) => (
        <InlineActionCard key={a.action_id} action={a} onDecided={onActionDecided} />
      ))}
    </div>
  );
}

function InlineActionCard({
  action,
  onDecided,
}: {
  action: PendingAction;
  onDecided: (actionId: string, status: string) => void;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decided = action.status === "approved" || action.status === "rejected";
  const approved = action.status === "approved";

  let payload: Record<string, unknown> = {};
  try {
    payload = action.payload_json ? JSON.parse(action.payload_json) : {};
  } catch {
    /* ignore */
  }
  const subject = (payload.subject as string) || "";
  const body =
    (payload.body as string) ||
    (payload.text as string) ||
    (payload.message as string) ||
    "";

  async function decide(verb: "approve" | "reject") {
    setBusy(verb);
    setError(null);
    try {
      if (verb === "approve") await api.approveAction(action.action_id);
      else await api.rejectAction(action.action_id);
      onDecided(action.action_id, verb === "approve" ? "approved" : "rejected");
    } catch (e) {
      setError(e instanceof ApiError ? e.body || e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <div
      className={`glass rounded-2xl rounded-tl-sm border ${
        decided
          ? approved
            ? "border-risk-low/30 bg-risk-low/5"
            : "border-white/10 bg-white/3 opacity-60"
          : "border-accent-500/30"
      }`}
    >
      <div className="px-3.5 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-accent-400" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-accent-400">
              {action.action_type.replace(/_/g, " ")}
            </span>
          </div>
          {decided ? (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                approved
                  ? "bg-risk-low/20 text-risk-low border border-risk-low/40"
                  : "bg-white/10 text-white/60 border border-white/20"
              }`}
            >
              {approved ? "✓ APPROVED" : "✗ REJECTED"}
            </span>
          ) : (
            action.confidence != null && (
              <span className="text-[10px] text-white/40">
                {Math.round(action.confidence * 100)}% conf
              </span>
            )
          )}
        </div>
        <div className="text-sm font-medium text-white mb-1">
          {action.customer_full_name || "—"}
        </div>
        {action.nelson_rationale && (
          <div className="text-[11px] text-white/65 italic mb-2">
            {action.nelson_rationale}
          </div>
        )}
        {(subject || body) && (
          <div className="bg-white/5 rounded-lg px-2.5 py-2 text-[11px] text-white/75 mb-2 max-h-32 overflow-y-auto scrollbar-thin">
            {subject && <div className="font-medium text-white/85 mb-1">{subject}</div>}
            {body && <div className="whitespace-pre-wrap leading-relaxed">{body}</div>}
          </div>
        )}
      </div>
      {!decided && (
        <div className="flex border-t border-white/10">
          <button
            onClick={() => decide("approve")}
            disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-risk-low hover:bg-risk-low/10 transition border-r border-white/10 disabled:opacity-50"
          >
            {busy === "approve" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Approve
          </button>
          <button
            onClick={() => decide("reject")}
            disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-white/60 hover:bg-white/5 transition disabled:opacity-50"
          >
            {busy === "reject" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <X className="w-3 h-3" />
            )}
            Reject
          </button>
        </div>
      )}
      {error && (
        <div className="px-3 py-1.5 text-[10px] text-risk-critical border-t border-risk-critical/30">
          {error}
        </div>
      )}
    </div>
  );
}

function TracePanel({ steps, live }: { steps: TraceStep[]; live: boolean }) {
  const [expanded, setExpanded] = useState(true);

  // Auto-collapse after streaming finishes
  useEffect(() => {
    if (!live && steps.length > 0) {
      setExpanded(false);
    }
  }, [live, steps.length]);

  if (steps.length === 0 && !live) return null;

  const completedCount = steps.filter((s) => s.summary !== undefined).length;
  const headerLabel = live
    ? `Nelson's reasoning · ${steps.length} step${steps.length !== 1 ? "s" : ""}`
    : `Nelson used ${steps.length} tool${steps.length !== 1 ? "s" : ""}`;

  return (
    <div className="glass rounded-2xl rounded-tl-sm overflow-hidden border border-accent-500/20">
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full px-3 py-2 flex items-center justify-between text-[11px] uppercase tracking-wider hover:bg-white/5 transition"
      >
        <span className="flex items-center gap-1.5 text-accent-400">
          <Wrench className="w-3 h-3" />
          {headerLabel}
        </span>
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-white/40" />
        ) : (
          <ChevronRight className="w-3 h-3 text-white/40" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {steps.map((step, i) => {
            const meta = toolMeta(step.name);
            const inProgress = live && step.summary === undefined;
            return (
              <div key={i} className="flex items-start gap-2 text-xs animate-fade-in">
                <span className="text-base leading-none mt-0.5">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white/85 font-medium flex items-center gap-2">
                    {meta.label}
                    {inProgress && <Loader2 className="w-3 h-3 animate-spin text-white/40" />}
                  </div>
                  {step.args && Object.keys(step.args).length > 0 && (
                    <div className="text-[10px] text-white/40 font-mono truncate">
                      {Object.entries(step.args)
                        .map(([k, v]) => `${k}=${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`)
                        .join(", ")}
                    </div>
                  )}
                  {step.summary && (
                    <div className="text-[11px] text-white/65 mt-0.5">↳ {step.summary}</div>
                  )}
                </div>
              </div>
            );
          })}
          {live && completedCount < steps.length && (
            <div className="text-[10px] text-white/30 italic pt-1">working…</div>
          )}
        </div>
      )}
    </div>
  );
}

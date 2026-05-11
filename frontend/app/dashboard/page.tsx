"use client";

// Dashboard restructured around Gartner's four levels of analytics maturity:
//
//   Top strip (descriptive)  →  KPIStrip
//   Center canvas (diagnostic)  →  DiagnosticCanvas (lane-grouped + tiered cards)
//   Right rail (predictive + prescriptive)  →  RightRail
//   Floating chat (orthogonal)  →  ChatWidget
//
// Account drill-in opens in a slide-over drawer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Customer, DashboardPayload, SessionInfo } from "@/lib/types";
import { KPIStrip } from "@/components/KPIStrip";
import { DiagnosticCanvas } from "@/components/DiagnosticCanvas";
import { DashboardControls } from "@/components/DashboardControls";
import { RightRail, PrescriptiveTab } from "@/components/RightRail";
import { ChatWidget } from "@/components/ChatWidget";
import { AccountDrawer } from "@/components/AccountDrawer";
import { Sidebar, NavTarget } from "@/components/Sidebar";
import { AppHeader } from "@/components/AppHeader";
import { ToastProvider } from "@/lib/toast";

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Search + filter
  const [search, setSearch] = useState("");
  const [bandFilter, setBandFilter] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Customer[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Cross-pane navigation state (sidebar / header bell drive these).
  const [activeNav, setActiveNav] = useState<NavTarget>("dashboard");
  const [prescriptiveTab, setPrescriptiveTab] = useState<PrescriptiveTab>("pending");
  const predictiveRef = useRef<HTMLDivElement>(null);
  const prescriptiveRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLElement>(null);

  const handleNavigate = useCallback((target: NavTarget) => {
    setActiveNav(target);
    if (target === "dashboard" || target === "customers") {
      // Reset filters/search; scroll canvas to top.
      if (target === "customers") {
        setSearch("");
        setBandFilter(null);
      }
      canvasRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } else if (target === "actions") {
      setPrescriptiveTab("pending");
      prescriptiveRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else if (target === "decisions") {
      setPrescriptiveTab("decided");
      prescriptiveRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  const jumpToFollowups = useCallback(() => {
    setActiveNav("dashboard");
    predictiveRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  // Debounced backend search across all 2,000 customers when query has 2+ chars.
  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api.listAccounts({ search: search.trim(), limit: 60 });
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Final account list driving the canvas — search overrides default top-at-risk,
  // band filter is applied on top.
  const displayedAccounts = useMemo(() => {
    const base = searchResults ?? data?.accounts ?? [];
    if (!bandFilter) return base;
    const needle = bandFilter.toLowerCase();
    return base.filter((c) => (c.risk_band || "").toLowerCase().includes(needle));
  }, [searchResults, data?.accounts, bandFilter]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const payload = await api.dashboard();
      setData(payload);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/login");
        return;
      }
      const msg =
        e instanceof ApiError
          ? `${e.status} from /api/portfolio/dashboard${e.status === 404 ? " — restart the backend so it picks up the new route" : ""}`
          : e instanceof Error
            ? e.message
            : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    api
      .me()
      .then(setSession)
      .then(refresh)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
      });
  }, [refresh, router]);

  async function logout() {
    await api.logout().catch(() => {});
    router.replace("/login");
  }

  return (
    <ToastProvider>
      <div className="h-screen w-screen overflow-hidden flex">
        {/* Left sidebar */}
        <Sidebar
          userId={session?.user_id || "—"}
          tenantName={session?.tenant_name || "—"}
          pendingActionsCount={data?.pending_actions.length ?? 0}
          activeTarget={activeNav}
          onNavigate={handleNavigate}
          onLogout={logout}
        />

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <AppHeader
            summary={data?.summary ?? null}
            pendingActionsCount={data?.pending_actions.length ?? 0}
            pendingFollowupsCount={data?.pending_followups.length ?? 0}
            onJumpToActions={() => handleNavigate("actions")}
            onJumpToDecisions={() => handleNavigate("decisions")}
            onJumpToFollowups={jumpToFollowups}
          />

          {/* Body */}
          <div className="flex-1 min-h-0 grid grid-cols-[1fr_340px] gap-4 p-4">
            {/* Left content: KPI strip + controls + diagnostic canvas */}
            <div className="flex flex-col gap-4 min-h-0">
              <KPIStrip
                summary={data?.summary ?? null}
                sentiment={data?.portfolio_sentiment ?? null}
                pendingFollowupsCount={data?.pending_followups.length ?? 0}
                pendingActionsCount={data?.pending_actions.length ?? 0}
              />
              <DashboardControls
                search={search}
                onSearchChange={setSearch}
                band={bandFilter}
                onBandChange={setBandFilter}
                resultCount={searchResults ? displayedAccounts.length : undefined}
                loading={searching}
              />
              <main ref={canvasRef} className="flex-1 min-h-0 overflow-y-auto pr-2 scrollbar-thin">
                {loading && (
                  <div className="space-y-4">
                    <div>
                      <div className="h-3 w-40 bg-white/10 rounded mb-3 animate-pulse-soft" />
                      <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className="glass rounded-2xl p-4 animate-pulse-soft h-[140px]"
                            style={{ animationDelay: `${i * 100}ms` }}
                          >
                            <div className="h-3 w-32 bg-white/15 rounded mb-3" />
                            <div className="h-2 w-20 bg-white/10 rounded mb-4" />
                            <div className="grid grid-cols-2 gap-2">
                              <div className="h-2 w-12 bg-white/10 rounded" />
                              <div className="h-2 w-12 bg-white/10 rounded" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {!loading && error && (
                  <div className="glass-deep rounded-2xl p-5 text-sm text-risk-critical bg-risk-critical/5 border border-risk-critical/30">
                    <div className="font-semibold mb-1">Dashboard data failed to load</div>
                    <div className="text-white/70 text-xs">{error}</div>
                    <button
                      onClick={refresh}
                      className="mt-3 text-xs glass rounded-md px-3 py-1.5 hover:bg-white/10 transition"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {!loading && !error && data && displayedAccounts.length === 0 && (search || bandFilter) && (
                  <div className="glass rounded-2xl p-8 text-sm text-white/60 text-center">
                    <div className="text-white/30 text-2xl mb-2">∅</div>
                    No customers match
                    {search && <> &quot;<span className="text-white">{search}</span>&quot;</>}
                    {bandFilter && <> in band <span className="text-white">{bandFilter}</span></>}.
                  </div>
                )}
                {!loading && !error && data && displayedAccounts.length > 0 && (
                  <DiagnosticCanvas
                    accounts={displayedAccounts}
                    sentiment={data.sentiment}
                    onSelect={setSelected}
                    selectedId={selected}
                  />
                )}
              </main>
            </div>

            {/* Right rail: predictive + prescriptive */}
            <div className="min-h-0">
              <RightRail
                followups={data?.pending_followups ?? []}
                actions={data?.pending_actions ?? []}
                prescriptiveTab={prescriptiveTab}
                onPrescriptiveTabChange={setPrescriptiveTab}
                predictiveRef={predictiveRef}
                prescriptiveRef={prescriptiveRef}
                onSelect={setSelected}
                onActionDecided={refresh}
              />
            </div>
          </div>
        </div>

        {/* Overlays */}
        <AccountDrawer customerId={selected} onClose={() => setSelected(null)} />
        <ChatWidget />
      </div>
    </ToastProvider>
  );
}

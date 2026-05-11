"use client";

// Full browsable list of every customer in the portfolio.
// Paginated server-side via /api/accounts?limit&offset&search.

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { Customer } from "@/lib/types";
import { bandClass, fmtMoney, fmtPct } from "@/lib/format";
import { RiskGauge } from "@/components/RiskGauge";

const PAGE_SIZE = 50;

type SortKey = "risk_score" | "name" | "revenue" | "late_rate";
type SortDir = "asc" | "desc";

interface Props {
  onSelect: (customerId: string) => void;
  selectedId?: string | null;
}

export function CustomersView({ onSelect, selectedId }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("risk_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [bandFilter, setBandFilter] = useState<string | null>(null);

  // Fetch when search changes (debounced) or page changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const results = await api.listAccounts({
          search: search.trim() || undefined,
          limit: search.trim() ? 200 : PAGE_SIZE,
          offset: search.trim() ? 0 : page * PAGE_SIZE,
        });
        if (!cancelled) setCustomers(results);
      } catch {
        if (!cancelled) setCustomers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [search, page]);

  // Client-side band filter + sort
  const displayed = useMemo(() => {
    let list = [...customers];
    if (bandFilter) {
      const needle = bandFilter.toLowerCase();
      list = list.filter((c) => (c.risk_band || "").toLowerCase().includes(needle));
    }
    list.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sortKey === "risk_score") {
        av = a.risk_score ?? 0;
        bv = b.risk_score ?? 0;
      } else if (sortKey === "name") {
        av = a.customer_full_name.toLowerCase();
        bv = b.customer_full_name.toLowerCase();
      } else if (sortKey === "revenue") {
        av = a.total_sales ?? 0;
        bv = b.total_sales ?? 0;
      } else if (sortKey === "late_rate") {
        av = a.late_delivery_rate ?? 0;
        bv = b.late_delivery_rate ?? 0;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [customers, bandFilter, sortKey, sortDir]);

  function setSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 gap-4">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">All customers</div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {search.trim() ? `Search: "${search.trim()}"` : "Portfolio directory"}
          </h2>
        </div>
        <div className="text-xs text-white/50">
          {loading ? "Loading…" : `${displayed.length} shown`}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search across all 2,000 customers…"
            className="w-full pl-9 pr-9 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent-500/60 transition"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 p-1 rounded transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {(["All", "Critical", "High", "Moderate", "Low"] as const).map((b) => {
            const active = b === "All" ? bandFilter === null : bandFilter === b;
            return (
              <button
                key={b}
                onClick={() => setBandFilter(b === "All" ? null : active ? null : b)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                  active
                    ? "bg-accent-500/20 text-accent-400 border-accent-500/40"
                    : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                }`}
              >
                {b}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="glass-deep rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-y-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ink-900/80 backdrop-blur-xs z-10 border-b border-white/10">
              <tr className="text-[10px] uppercase tracking-wider text-white/45">
                <Th onClick={() => setSort("name")} active={sortKey === "name"} dir={sortDir}>
                  Customer
                </Th>
                <th className="px-3 py-3 text-left">Segment · Country</th>
                <th className="px-3 py-3 text-left">Band</th>
                <Th onClick={() => setSort("risk_score")} active={sortKey === "risk_score"} dir={sortDir} align="right">
                  Risk
                </Th>
                <Th onClick={() => setSort("revenue")} active={sortKey === "revenue"} dir={sortDir} align="right">
                  Revenue
                </Th>
                <Th onClick={() => setSort("late_rate")} active={sortKey === "late_rate"} dir={sortDir} align="right">
                  Late
                </Th>
                <th className="px-3 py-3 text-left">Lifecycle</th>
              </tr>
            </thead>
            <tbody>
              {loading && displayed.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-white/40 text-sm py-12 animate-pulse-soft">
                    Loading customers…
                  </td>
                </tr>
              )}
              {!loading && displayed.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-white/40 text-sm py-12">
                    No customers match.
                  </td>
                </tr>
              )}
              {displayed.map((c) => (
                <tr
                  key={c.customer_id}
                  onClick={() => onSelect(c.customer_id)}
                  className={`border-t border-white/5 hover:bg-white/5 cursor-pointer transition ${
                    selectedId === c.customer_id ? "bg-accent-500/10" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-white">{c.customer_full_name}</div>
                    <div className="text-[10px] text-white/35 font-mono">{c.customer_id}</div>
                  </td>
                  <td className="px-3 py-2.5 text-white/70 text-xs">
                    {c.customer_segment || "—"}
                    {c.customer_country ? ` · ${c.customer_country}` : ""}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={bandClass(c.risk_band)}>{c.risk_band || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <RiskGauge score={c.risk_score} band={c.risk_band} size={28} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-white tabular-nums">
                    {fmtMoney(c.total_sales)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-white/70 tabular-nums">
                    {fmtPct(c.late_delivery_rate)}
                  </td>
                  <td className="px-3 py-2.5 text-white/60 text-xs truncate max-w-[120px]">
                    {c.lifecycle_stage || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination (only when not searching) */}
        {!search.trim() && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/10 text-xs text-white/55">
            <span>
              Page {page + 1} · showing {displayed.length} of 2,000
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={displayed.length < PAGE_SIZE}
                className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({
  onClick,
  active,
  dir,
  children,
  align = "left",
}: {
  onClick: () => void;
  active: boolean;
  dir: SortDir;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-3 cursor-pointer hover:text-white transition select-none ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <span className={`inline-flex items-center gap-1 ${active ? "text-accent-400" : ""}`}>
        {children}
        <ArrowUpDown className={`w-2.5 h-2.5 ${active ? "opacity-100" : "opacity-40"}`} />
      </span>
    </th>
  );
}

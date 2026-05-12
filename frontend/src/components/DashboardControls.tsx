"use client";

import { Heart, Search, ShieldAlert, X } from "lucide-react";

export type AccountView = "at_risk" | "healthy";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  band: string | null;
  onBandChange: (band: string | null) => void;
  view: AccountView;
  onViewChange: (v: AccountView) => void;
  resultCount?: number;
  loading?: boolean;
}

const BANDS = ["Critical", "High", "Moderate", "Low"] as const;

export function DashboardControls({
  search,
  onSearchChange,
  band,
  onBandChange,
  view,
  onViewChange,
  resultCount,
  loading,
}: Props) {
  const isHealthy = view === "healthy";
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3">
      {/* View toggle — at-risk vs healthy */}
      <div className="glass rounded-full p-0.5 flex flex-shrink-0">
        <ViewBtn
          active={!isHealthy}
          onClick={() => onViewChange("at_risk")}
          icon={<ShieldAlert className="w-3.5 h-3.5" />}
          tone="risk"
        >
          At risk
        </ViewBtn>
        <ViewBtn
          active={isHealthy}
          onClick={() => onViewChange("healthy")}
          icon={<Heart className="w-3.5 h-3.5" />}
          tone="healthy"
        >
          Healthy
        </ViewBtn>
      </div>

      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search customers by name or email…"
          className="w-full pl-9 pr-9 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent-500/60 transition"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 p-1 rounded transition"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {search && resultCount !== undefined && !loading && (
          <span className="absolute right-9 top-1/2 -translate-y-1/2 text-[10px] text-white/40">
            {resultCount} match{resultCount === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {/* Band filter pills — only meaningful in at-risk view */}
      {!isHealthy && (
        <div className="flex gap-1.5 flex-shrink-0">
          <Pill active={band === null} onClick={() => onBandChange(null)}>
            All
          </Pill>
          {BANDS.map((b) => (
            <Pill
              key={b}
              active={band === b}
              onClick={() => onBandChange(band === b ? null : b)}
              tone={b}
            >
              {b}
            </Pill>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  children,
  icon,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
  tone: "risk" | "healthy";
}) {
  const activeCls =
    tone === "healthy"
      ? "bg-risk-low/20 text-risk-low ring-1 ring-risk-low/40"
      : "bg-accent-500/20 text-accent-400 ring-1 ring-accent-500/40";
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition ${
        active ? activeCls : "text-white/55 hover:text-white/85"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Pill({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "Critical" | "High" | "Moderate" | "Low";
}) {
  const base = "px-3 py-1.5 rounded-full text-xs font-medium transition border";
  if (active) {
    if (tone === "Critical") return <button onClick={onClick} className={`${base} bg-risk-critical/20 text-risk-critical border-risk-critical/50`}>{children}</button>;
    if (tone === "High") return <button onClick={onClick} className={`${base} bg-risk-high/20 text-risk-high border-risk-high/50`}>{children}</button>;
    if (tone === "Moderate") return <button onClick={onClick} className={`${base} bg-risk-moderate/20 text-risk-moderate border-risk-moderate/50`}>{children}</button>;
    if (tone === "Low") return <button onClick={onClick} className={`${base} bg-risk-low/20 text-risk-low border-risk-low/50`}>{children}</button>;
    return <button onClick={onClick} className={`${base} bg-accent-500/20 text-accent-400 border-accent-500/40`}>{children}</button>;
  }
  return (
    <button
      onClick={onClick}
      className={`${base} bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/80`}
    >
      {children}
    </button>
  );
}

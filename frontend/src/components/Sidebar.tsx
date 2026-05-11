"use client";

import { LayoutDashboard, Sparkles, History, Users, Settings, LogOut } from "lucide-react";

export type NavTarget = "dashboard" | "customers" | "actions" | "decisions";

interface Props {
  userId: string;
  tenantName: string;
  pendingActionsCount: number;
  activeTarget: NavTarget;
  onNavigate: (target: NavTarget) => void;
  onLogout: () => void;
}

const NAV: { id: NavTarget; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "customers", label: "Customers", icon: Users },
  { id: "actions", label: "Actions", icon: Sparkles },
  { id: "decisions", label: "Decisions", icon: History },
];

export function Sidebar({
  userId,
  tenantName,
  pendingActionsCount,
  activeTarget,
  onNavigate,
  onLogout,
}: Props) {
  return (
    <aside className="w-[220px] flex-shrink-0 h-full flex flex-col border-r border-white/5 bg-ink-900/50 backdrop-blur-xs">
      {/* Brand */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-accent-500/30">
            N
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-risk-low rounded-full ring-2 ring-ink-900 animate-pulse-soft" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm tracking-tight">Nelson</div>
            <div className="text-[10px] text-white/40 truncate">AI Account Mgr</div>
          </div>
        </div>
      </div>

      {/* Tenant chip */}
      <div className="px-3 mb-4">
        <div className="glass rounded-lg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-white/40">Workspace</div>
          <div className="text-xs text-white/85 truncate font-medium mt-0.5">{tenantName}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = activeTarget === item.id;
          const badge =
            item.id === "actions" && pendingActionsCount > 0 ? pendingActionsCount : null;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${active ? "text-accent-400" : "text-white/45"}`}
              />
              <span className="flex-1 text-left">{item.label}</span>
              {badge != null && (
                <span className="text-[10px] bg-accent-500/20 text-accent-400 px-1.5 py-0.5 rounded-full font-medium">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/5 space-y-1">
        <button
          disabled
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/40 hover:bg-white/5 transition disabled:cursor-default"
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          <span>Settings</span>
        </button>
        <div className="glass rounded-lg p-2.5 mt-2">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
            Signed in as
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-white/80 truncate flex-1">{userId}</div>
            <button
              onClick={onLogout}
              className="text-white/40 hover:text-white transition flex-shrink-0 p-1 rounded hover:bg-white/10"
              aria-label="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

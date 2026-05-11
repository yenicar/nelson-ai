"use client";

// Minimal toast system. One provider, one hook, stackable transient banners.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AlertCircle, Check, Info, X } from "lucide-react";

export type ToastKind = "success" | "info" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  ttl?: number;
}

interface Ctx {
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<Ctx | null>(null);

export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast must be inside <ToastProvider>");
  return c;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = `t-${Math.random().toString(36).slice(2, 10)}`;
    setToasts((prev) => [...prev, { ...t, id }]);
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={{ push, dismiss }}>
      {children}
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

function ToastStack({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <ToastBubble key={t.id} toast={t} dismiss={dismiss} />
      ))}
    </div>
  );
}

const KIND_STYLE: Record<ToastKind, { icon: React.ReactNode; ring: string }> = {
  success: {
    icon: <Check className="w-4 h-4 text-risk-low" />,
    ring: "border-risk-low/30",
  },
  info: {
    icon: <Info className="w-4 h-4 text-accent-400" />,
    ring: "border-accent-500/30",
  },
  error: {
    icon: <AlertCircle className="w-4 h-4 text-risk-critical" />,
    ring: "border-risk-critical/30",
  },
};

function ToastBubble({
  toast,
  dismiss,
}: {
  toast: Toast;
  dismiss: (id: string) => void;
}) {
  useEffect(() => {
    const ttl = toast.ttl ?? 3500;
    const timer = setTimeout(() => dismiss(toast.id), ttl);
    return () => clearTimeout(timer);
  }, [toast.id, toast.ttl, dismiss]);

  const style = KIND_STYLE[toast.kind];
  return (
    <div
      className={`glass-deep rounded-full pl-3.5 pr-2 py-1.5 border ${style.ring} flex items-center gap-2.5 text-sm pointer-events-auto animate-slide-up shadow-glass-deep min-w-[280px] max-w-[420px]`}
    >
      <span className="flex-shrink-0">{style.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{toast.title}</div>
        {toast.body && (
          <div className="text-white/55 text-xs truncate">{toast.body}</div>
        )}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="flex-shrink-0 w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white/80 transition"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

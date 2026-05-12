// Thin API client. All requests include credentials so the session cookie flows.

import type {
  ApproveResponse,
  ChatResponse,
  Customer,
  DashboardPayload,
  DecidedAction,
  PendingAction,
  PendingFollowup,
  PortfolioSummary,
  SessionInfo,
  StreamEvent,
} from "./types";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API ${status}: ${body}`);
  }
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<SessionInfo>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<SessionInfo>("/api/auth/me"),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  // Health
  health: () => request<{ ok: boolean; model_key_configured: boolean; customers_loaded: number }>("/api/health"),

  // Portfolio
  portfolioSummary: () => request<PortfolioSummary>("/api/portfolio/summary"),
  topAtRisk: (limit = 10) => request<Customer[]>(`/api/portfolio/top-at-risk?limit=${limit}`),
  topHealthy: (limit = 60) => request<Customer[]>(`/api/portfolio/top-healthy?limit=${limit}`),
  pendingFollowups: (limit = 12) =>
    request<PendingFollowup[]>(`/api/portfolio/pending-followups?limit=${limit}`),
  dashboard: () => request<DashboardPayload>("/api/portfolio/dashboard"),

  // Accounts
  listAccounts: (params: { limit?: number; offset?: number; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    if (params.search) q.set("search", params.search);
    return request<Customer[]>(`/api/accounts?${q.toString()}`);
  },
  getAccount: (customerId: string) => request<Customer>(`/api/accounts/${customerId}`),
  getActivity: (customerId: string) =>
    request<{
      customer: Customer;
      orders: any[];
      tickets: any[];
      notes: any[];
      emails: any[];
      engagement: any[];
      fulfillment: any[];
      reviews: any[];
    }>(`/api/accounts/${customerId}/activity`),

  // Chat
  chat: (message: string, session_id?: string | null) =>
    request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, session_id, use_cache: false }),
    }),
  streamChat: async (
    message: string,
    sessionId: string | null | undefined,
    onEvent: (event: StreamEvent) => void,
  ) => {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId ?? null }),
    });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new ApiError(response.status, text || response.statusText);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const line = chunk.startsWith("data: ") ? chunk.slice(6) : chunk;
        if (!line.trim()) continue;
        try {
          onEvent(JSON.parse(line) as StreamEvent);
        } catch {
          // ignore parse errors on partial chunks
        }
      }
    }
  },
  getSessionMessages: (sessionId: string) =>
    request<Array<{ role: string; content: string; created_at: string }>>(
      `/api/chat/sessions/${sessionId}/messages`
    ),

  // Actions
  pendingActions: () => request<PendingAction[]>("/api/actions/pending"),
  decidedActions: (limit = 20) =>
    request<DecidedAction[]>(`/api/actions/decided?limit=${limit}`),
  getAction: (actionId: string) =>
    request<PendingAction>(`/api/actions/${actionId}`),
  approveAction: (actionId: string, notes?: string) =>
    request<ApproveResponse>(`/api/actions/${actionId}/approve`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  rejectAction: (actionId: string, notes?: string) =>
    request<ApproveResponse>(`/api/actions/${actionId}/reject`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  editActionPayload: (actionId: string, payload: Record<string, unknown>) =>
    request<{ action_id: string; updated: boolean }>(`/api/actions/${actionId}`, {
      method: "PATCH",
      body: JSON.stringify({ payload_json: JSON.stringify(payload) }),
    }),
};

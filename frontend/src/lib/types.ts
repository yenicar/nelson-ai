// TypeScript mirrors of the pydantic schemas. Keep in sync with backend/nelson/data/schemas.py.

export type RiskBand = "Critical" | "High" | "Moderate" | "Elevated" | "Low" | "Stable" | string;

export interface Customer {
  customer_id: string;
  customer_full_name: string;
  customer_email?: string | null;
  customer_segment?: string | null;
  customer_country?: string | null;
  primary_market?: string | null;
  primary_region?: string | null;
  total_orders?: number | null;
  total_sales?: number | null;
  total_profit?: number | null;
  late_delivery_count?: number | null;
  late_delivery_rate?: number | null;
  support_ticket_count?: number | null;
  open_support_ticket_count?: number | null;
  risk_score?: number | null;
  risk_band?: RiskBand | null;
  health_score?: number | null;
  lifecycle_stage?: string | null;
  churn_risk_reason?: string | null;
  next_best_action?: string | null;
  last_review_decision?: string | null;
  tenant_id: string;
}

export interface Order {
  order_id: string;
  customer_id: string;
  order_date?: string | null;
  shipping_date?: string | null;
  order_status?: string | null;
  delivery_status?: string | null;
  late_delivery_risk?: number | null;
  order_sales?: number | null;
  order_profit?: number | null;
  days_scheduled?: number | null;
  days_actual?: number | null;
  issue_flag?: string | null;
}

export interface SupportTicket {
  ticket_id: string;
  customer_id: string;
  date_of_purchase?: string | null;
  ticket_type?: string | null;
  ticket_subject?: string | null;
  ticket_description?: string | null;
  ticket_status?: string | null;
  ticket_priority?: string | null;
  resolution_time_hours?: number | null;
  customer_satisfaction_rating?: number | null;
  customer_sentiment?: string | null;
}

export interface CustomerNote {
  note_id: string;
  customer_id: string;
  scenario?: string | null;
  topic?: string | null;
  note_date?: string | null;
  author?: string | null;
  note_type?: string | null;
  note_text: string;
  source_signal_ids?: string | null;
}

export interface CustomerEmail {
  email_id: string;
  thread_id?: string | null;
  customer_id: string;
  scenario?: string | null;
  topic?: string | null;
  date?: string | null;
  direction?: string | null;
  subject?: string | null;
  body: string;
  sentiment_hint?: string | null;
}

export interface PortfolioSummary {
  tenant_id?: string;
  total_customers?: number;
  critical_count?: number;
  high_count?: number;
  moderate_count?: number;
  low_count?: number;
  avg_risk_score?: number;
  avg_health_score?: number;
  total_revenue?: number;
  total_profit?: number;
  revenue_at_risk?: number;
}

export interface PendingFollowup {
  review_id: string;
  customer_id: string;
  customer_full_name: string;
  scenario?: string | null;
  topic?: string | null;
  reviewed_at?: string | null;
  human_decision?: string | null;
  outcome_status?: string | null;
  follow_up_required?: boolean | null;
  outcome_date?: string | null;
  risk_band?: string | null;
  risk_score?: number | null;
  next_best_action?: string | null;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  net: number; // -100 to +100
}

export interface DashboardPayload {
  summary: PortfolioSummary;
  portfolio_sentiment: SentimentBreakdown;
  accounts: Customer[];
  sentiment: Record<string, SentimentBreakdown>; // keyed by customer_id
  pending_followups: PendingFollowup[];
  pending_actions: PendingAction[];
}

export interface SessionInfo {
  user_id: string;
  tenant_id: string;
  tenant_name: string;
}

export interface ChatResponse {
  response: string;
  session_id: string;
  cached: boolean;
}

// Streaming chat events from POST /api/chat/stream
export type StreamEvent =
  | { type: "session"; session_id: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; summary: string }
  | { type: "action_drafted"; action_id: string; customer_name?: string; action_type?: string }
  | { type: "message"; content: string }
  | { type: "done"; session_id: string }
  | { type: "error"; message: string };

export interface TraceStep {
  name: string;
  args?: Record<string, unknown>;
  summary?: string;
}

export interface PendingAction {
  action_id: string;
  tenant_id: string;
  customer_id: string;
  customer_full_name?: string | null;
  action_type: string;
  payload_json: string;
  status: string;
  created_at: string;
  decided_at?: string | null;
  decided_by?: string | null;
  nelson_rationale?: string | null;
  confidence?: number | null;
}

export interface DecidedAction extends PendingAction {
  decision_id?: string | null;
  decision_notes?: string | null;
}

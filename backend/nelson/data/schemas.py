"""Pydantic models for the customer_2000 spine + runtime tables.

Used as typed return types from repositories. Loaders skip per-row validation
for speed; column-name drift is caught by `build.expected_columns()`.
"""
from __future__ import annotations

from datetime import date as DateT, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)


# --------------- Spine ---------------

class Customer(_Base):
    customer_id: str
    customer_full_name: str
    customer_email: str | None = None
    customer_segment: str | None = None
    customer_country: str | None = None
    customer_state: str | None = None
    customer_city: str | None = None
    primary_market: str | None = None
    primary_region: str | None = None
    total_orders: int | None = None
    total_sales: float | None = None
    total_profit: float | None = None
    late_delivery_count: int | None = None
    late_delivery_rate: float | None = None
    support_ticket_count: int | None = None
    open_support_ticket_count: int | None = None
    risk_score: float | None = None
    risk_band: str | None = None
    health_score: float | None = None
    lifecycle_stage: str | None = None
    churn_risk_reason: str | None = None
    next_best_action: str | None = None
    last_review_decision: str | None = None
    last_meaningful_touch_date: DateT | None = None
    tenant_id: str = "demo-tenant"


class Order(_Base):
    order_id: str
    customer_id: str
    order_date: DateT | None = None
    shipping_date: DateT | None = None
    order_status: str | None = None
    delivery_status: str | None = None
    late_delivery_risk: int | None = None
    shipping_mode: str | None = None
    order_sales: float | None = None
    order_profit: float | None = None
    order_total: float | None = None
    days_scheduled: int | None = None
    days_actual: int | None = None
    issue_flag: str | None = None
    tenant_id: str = "demo-tenant"


class SupportTicket(_Base):
    ticket_id: str
    customer_id: str
    customer_full_name: str | None = None
    date_of_purchase: DateT | None = None
    ticket_type: str | None = None
    ticket_subject: str | None = None
    ticket_description: str | None = None
    ticket_status: str | None = None
    ticket_priority: str | None = None
    ticket_channel: str | None = None
    resolution: str | None = None
    resolution_time_hours: float | None = None
    customer_satisfaction_rating: float | None = None
    customer_sentiment: str | None = None
    tenant_id: str = "demo-tenant"


class CustomerNote(_Base):
    note_id: str
    customer_id: str
    customer_full_name: str | None = None
    scenario: str | None = None
    topic: str | None = None
    note_date: DateT | None = None
    author: str | None = None
    note_type: str | None = None
    note_text: str
    source_signal_ids: str | None = None
    tenant_id: str = "demo-tenant"


class CustomerEmail(_Base):
    email_id: str
    thread_id: str | None = None
    customer_id: str
    customer_full_name: str | None = None
    scenario: str | None = None
    topic: str | None = None
    message_sequence: int | None = None
    direction: str | None = None
    date: DateT | None = None
    sender_type: str | None = None
    recipient_type: str | None = None
    subject: str | None = None
    body: str
    sentiment_hint: str | None = None
    source_signal_ids: str | None = None
    tenant_id: str = "demo-tenant"


class CustomerReview(_Base):
    review_id: str
    customer_id: str
    customer_full_name: str | None = None
    scenario: str | None = None
    topic: str | None = None
    reviewed_at: datetime | None = None
    reviewer: str | None = None
    human_decision: str | None = None
    review_notes: str | None = None
    decision_boundary: str | None = None
    tenant_id: str = "demo-tenant"


class ReviewOutcome(_Base):
    outcome_id: str
    review_id: str
    customer_id: str
    customer_full_name: str | None = None
    outcome_date: DateT | None = None
    outcome_status: str | None = None
    outcome_type: str | None = None
    follow_up_required: bool | None = None
    tenant_id: str = "demo-tenant"


class EngagementEvent(_Base):
    engagement_id: str
    customer_id: str
    event_date: DateT | None = None
    event_type: str | None = None
    campaign: str | None = None
    channel: str | None = None
    engagement_score: float | None = None
    tenant_id: str = "demo-tenant"


class FulfillmentEvent(_Base):
    fulfillment_event_id: str
    order_id: str | None = None
    customer_id: str
    event_date: DateT | None = None
    event_type: str | None = None
    severity: str | None = None
    root_cause: str | None = None
    resolution_status: str | None = None
    tenant_id: str = "demo-tenant"


class CustomerContact(_Base):
    contact_id: str
    customer_id: str
    contact_full_name: str | None = None
    contact_email: str | None = None
    role: str | None = None
    influence_level: str | None = None
    preferred_channel: str | None = None
    tenant_id: str = "demo-tenant"


class CustomerAdjustment(_Base):
    adjustment_id: str
    customer_id: str
    ticket_id: str | None = None
    adjustment_type: str | None = None
    amount: float | None = None
    reason: str | None = None
    status: str | None = None
    created_date: DateT | None = None
    tenant_id: str = "demo-tenant"


# --------------- Runtime tables (Nelson-managed) ---------------

class PendingAction(_Base):
    action_id: str
    tenant_id: str
    customer_id: str
    customer_full_name: str | None = None
    action_type: str  # send_email | proactive_outreach | reclassify_band | update_lifecycle | escalate | schedule_followup | recommend_credit | recommend_expedite
    payload_json: str  # raw JSON; structure varies by action_type
    status: str = "pending"  # pending | approved | rejected | executed
    created_at: datetime
    decided_at: datetime | None = None
    decided_by: str | None = None
    nelson_rationale: str | None = None
    confidence: float | None = None


class NelsonSession(_Base):
    session_id: str
    tenant_id: str
    user_id: str
    surface: str  # dashboard | telegram
    started_at: datetime
    last_active_at: datetime


class NelsonMessage(_Base):
    message_id: str
    session_id: str
    role: str  # user | assistant | tool
    content: str
    tool_calls_json: str | None = None
    created_at: datetime


class HumanDecision(_Base):
    decision_id: str
    tenant_id: str
    customer_id: str
    customer_full_name: str | None = None
    decision: str  # approve | reject | override | defer
    decided_by: str
    decided_at: datetime
    decision_notes: str | None = None
    related_action_id: str | None = None
    related_review_id: str | None = None


def to_dict(model: BaseModel) -> dict[str, Any]:
    """Serialize a model for JSON-friendly use (datetimes as ISO strings)."""
    return model.model_dump(mode="json")

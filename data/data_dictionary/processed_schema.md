# Processed Schema

Canonical Phase 0 processed CSV schema inferred from `data/processed/`.

## `accounts.csv`

| Field | Type | Nullable | Origin | Description |
|---|---|---|---|---|
| `account_id` | string | no | derived | Nelson DSS account identifier. |
| `source_customer_id` | integer | no | Kaggle-derived | Original DataCo source customer identifier retained for traceability. |
| `account_name` | string | no | controlled synthetic |  |
| `industry` | string | no | controlled synthetic |  |
| `region` | string | no | Kaggle-derived |  |
| `segment` | string | no | derived |  |
| `account_owner` | string | no | controlled synthetic |  |
| `annual_revenue` | decimal | no | derived |  |
| `contract_value` | decimal | no | controlled synthetic |  |
| `contract_start_date` | date | no | controlled synthetic |  |
| `contract_end_date` | date | no | controlled synthetic |  |
| `last_activity_date` | date | no | controlled synthetic |  |
| `satisfaction_score` | decimal | no | derived |  |
| `customer_since` | date | no | controlled synthetic |  |

## `orders.csv`

| Field | Type | Nullable | Origin | Description |
|---|---|---|---|---|
| `order_id` | string | no | derived |  |
| `account_id` | string | no | derived | Nelson DSS account identifier. |
| `source_order_id` | integer | no | Kaggle-derived |  |
| `order_date` | date | no | Kaggle-derived |  |
| `promised_delivery_date` | date | no | derived |  |
| `actual_delivery_date` | date | no | derived |  |
| `days_scheduled` | integer | no | Kaggle-derived |  |
| `days_actual` | integer | no | Kaggle-derived |  |
| `delivery_status` | string | no | Kaggle-derived |  |
| `late_delivery_risk` | integer | no | Kaggle-derived |  |
| `order_value` | decimal | no | Kaggle-derived |  |
| `profit_per_order` | string | yes | Kaggle-derived if available |  |
| `product_category` | string | no | Kaggle-derived |  |
| `shipping_mode` | string | no | Kaggle-derived |  |
| `region` | string | no | Kaggle-derived |  |
| `issue_flag` | string | no | derived |  |

## `support_tickets.csv`

| Field | Type | Nullable | Origin | Description |
|---|---|---|---|---|
| `ticket_id` | string | no | derived |  |
| `account_id` | string | no | derived | Nelson DSS account identifier. |
| `source_ticket_id` | integer | no | Kaggle-derived |  |
| `opened_date` | date | no | Kaggle-derived |  |
| `closed_date` | date | yes | Kaggle-derived if available |  |
| `category` | string | no | Kaggle-derived |  |
| `severity` | string | no | derived |  |
| `priority` | string | no | derived |  |
| `status` | string | no | derived |  |
| `resolution_time_hours` | decimal | yes | derived |  |
| `description` | string | no | Kaggle-derived redacted |  |
| `customer_sentiment` | string | no | derived |  |

## `account_notes.csv`

| Field | Type | Nullable | Origin | Description |
|---|---|---|---|---|
| `note_id` | string | no | controlled synthetic |  |
| `account_id` | string | no | derived | Nelson DSS account identifier. |
| `note_date` | date | no | controlled synthetic |  |
| `author` | string | no | controlled synthetic |  |
| `note_type` | string | no | controlled synthetic |  |
| `note_text` | string | no | controlled synthetic |  |
| `synthetic_flag` | string | no | controlled synthetic | Indicates whether the record is synthetic demo text. |
| `source_signal_ids` | string | no | derived evidence link | Semicolon-separated IDs for supporting orders and support tickets. |

## `email_logs.csv`

| Field | Type | Nullable | Origin | Description |
|---|---|---|---|---|
| `email_id` | string | no | controlled synthetic |  |
| `account_id` | string | no | derived | Nelson DSS account identifier. |
| `date` | date | no | controlled synthetic |  |
| `sender_type` | string | no | controlled synthetic |  |
| `subject` | string | no | controlled synthetic |  |
| `body` | string | no | controlled synthetic |  |
| `sentiment_hint` | string | no | derived |  |
| `synthetic_flag` | string | no | controlled synthetic | Indicates whether the record is synthetic demo text. |
| `source_signal_ids` | string | no | derived evidence link | Semicolon-separated IDs for supporting orders and support tickets. |

## `account_bridge.csv`

| Field | Type | Nullable | Origin | Description |
|---|---|---|---|---|
| `source_customer_id` | integer | no | Kaggle-derived | Original DataCo source customer identifier retained for traceability. |
| `account_id` | string | no | derived | Nelson DSS account identifier. |
| `account_name` | string | no | controlled synthetic |  |
| `mapping_method` | string | no | derived |  |
| `source_dataset` | string | no | derived |  |
| `notes` | string | no | controlled synthetic |  |

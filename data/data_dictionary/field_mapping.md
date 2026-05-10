# Field Mapping

This mapping documents whether each target field is Kaggle-derived, derived by deterministic scripts, redacted, or controlled synthetic demo context.

| Target file | Target field | Source / generation method |
|---|---|---|
| `accounts.csv` | `account_id` | derived via Phase 0 scripts. |
| `accounts.csv` | `source_customer_id` | Kaggle-derived via Phase 0 scripts. |
| `accounts.csv` | `account_name` | controlled synthetic via Phase 0 scripts. |
| `accounts.csv` | `industry` | controlled synthetic via Phase 0 scripts. |
| `accounts.csv` | `region` | Kaggle-derived via Phase 0 scripts. |
| `accounts.csv` | `segment` | derived via Phase 0 scripts. |
| `accounts.csv` | `account_owner` | controlled synthetic via Phase 0 scripts. |
| `accounts.csv` | `annual_revenue` | derived via Phase 0 scripts. |
| `accounts.csv` | `contract_value` | controlled synthetic via Phase 0 scripts. |
| `accounts.csv` | `contract_start_date` | controlled synthetic via Phase 0 scripts. |
| `accounts.csv` | `contract_end_date` | controlled synthetic via Phase 0 scripts. |
| `accounts.csv` | `last_activity_date` | controlled synthetic via Phase 0 scripts. |
| `accounts.csv` | `satisfaction_score` | derived via Phase 0 scripts. |
| `accounts.csv` | `customer_since` | controlled synthetic via Phase 0 scripts. |
| `orders.csv` | `order_id` | derived via Phase 0 scripts. |
| `orders.csv` | `account_id` | derived via Phase 0 scripts. |
| `orders.csv` | `source_order_id` | Kaggle-derived via Phase 0 scripts. |
| `orders.csv` | `order_date` | Kaggle-derived via Phase 0 scripts. |
| `orders.csv` | `promised_delivery_date` | derived via Phase 0 scripts. |
| `orders.csv` | `actual_delivery_date` | derived via Phase 0 scripts. |
| `orders.csv` | `days_scheduled` | Kaggle-derived via Phase 0 scripts. |
| `orders.csv` | `days_actual` | Kaggle-derived via Phase 0 scripts. |
| `orders.csv` | `delivery_status` | Kaggle-derived via Phase 0 scripts. |
| `orders.csv` | `late_delivery_risk` | Kaggle-derived via Phase 0 scripts. |
| `orders.csv` | `order_value` | Kaggle-derived via Phase 0 scripts. |
| `orders.csv` | `profit_per_order` | Kaggle-derived if available via Phase 0 scripts. |
| `orders.csv` | `product_category` | Kaggle-derived via Phase 0 scripts. |
| `orders.csv` | `shipping_mode` | Kaggle-derived via Phase 0 scripts. |
| `orders.csv` | `region` | Kaggle-derived via Phase 0 scripts. |
| `orders.csv` | `issue_flag` | derived via Phase 0 scripts. |
| `support_tickets.csv` | `ticket_id` | derived via Phase 0 scripts. |
| `support_tickets.csv` | `account_id` | derived via Phase 0 scripts. |
| `support_tickets.csv` | `source_ticket_id` | Kaggle-derived via Phase 0 scripts. |
| `support_tickets.csv` | `opened_date` | Kaggle-derived via Phase 0 scripts. |
| `support_tickets.csv` | `closed_date` | Kaggle-derived if available via Phase 0 scripts. |
| `support_tickets.csv` | `category` | Kaggle-derived via Phase 0 scripts. |
| `support_tickets.csv` | `severity` | derived via Phase 0 scripts. |
| `support_tickets.csv` | `priority` | derived via Phase 0 scripts. |
| `support_tickets.csv` | `status` | derived via Phase 0 scripts. |
| `support_tickets.csv` | `resolution_time_hours` | derived via Phase 0 scripts. |
| `support_tickets.csv` | `description` | Kaggle-derived redacted via Phase 0 scripts. |
| `support_tickets.csv` | `customer_sentiment` | derived via Phase 0 scripts. |
| `account_notes.csv` | `note_id` | controlled synthetic via Phase 0 scripts. |
| `account_notes.csv` | `account_id` | derived via Phase 0 scripts. |
| `account_notes.csv` | `note_date` | controlled synthetic via Phase 0 scripts. |
| `account_notes.csv` | `author` | controlled synthetic via Phase 0 scripts. |
| `account_notes.csv` | `note_type` | controlled synthetic via Phase 0 scripts. |
| `account_notes.csv` | `note_text` | controlled synthetic via Phase 0 scripts. |
| `account_notes.csv` | `synthetic_flag` | controlled synthetic via Phase 0 scripts. |
| `account_notes.csv` | `source_signal_ids` | derived evidence link via Phase 0 scripts. |
| `email_logs.csv` | `email_id` | controlled synthetic via Phase 0 scripts. |
| `email_logs.csv` | `account_id` | derived via Phase 0 scripts. |
| `email_logs.csv` | `date` | controlled synthetic via Phase 0 scripts. |
| `email_logs.csv` | `sender_type` | controlled synthetic via Phase 0 scripts. |
| `email_logs.csv` | `subject` | controlled synthetic via Phase 0 scripts. |
| `email_logs.csv` | `body` | controlled synthetic via Phase 0 scripts. |
| `email_logs.csv` | `sentiment_hint` | derived via Phase 0 scripts. |
| `email_logs.csv` | `synthetic_flag` | controlled synthetic via Phase 0 scripts. |
| `email_logs.csv` | `source_signal_ids` | derived evidence link via Phase 0 scripts. |
| `account_bridge.csv` | `source_customer_id` | Kaggle-derived via Phase 0 scripts. |
| `account_bridge.csv` | `account_id` | derived via Phase 0 scripts. |
| `account_bridge.csv` | `account_name` | controlled synthetic via Phase 0 scripts. |
| `account_bridge.csv` | `mapping_method` | derived via Phase 0 scripts. |
| `account_bridge.csv` | `source_dataset` | derived via Phase 0 scripts. |
| `account_bridge.csv` | `notes` | controlled synthetic via Phase 0 scripts. |

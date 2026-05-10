# Synthetic Data Statement

Nelson DSS uses controlled synthetic demo data where the public source datasets do not contain complete B2B account-management context.

## Synthetic Scope

- `accounts.csv` includes synthetic company names, owners, contract dates, and customer-success context.
- `account_notes.csv` and `email_logs.csv` are fully synthetic text records.
- Synthetic text is grounded in existing order/support evidence through `source_signal_ids`.
- Synthetic records must not be represented as real customer communications.

## Synthetic / Evidence Fields

| File | Field | Origin |
|---|---|---|
| `accounts.csv` | `account_name` | controlled synthetic |
| `accounts.csv` | `industry` | controlled synthetic |
| `accounts.csv` | `account_owner` | controlled synthetic |
| `accounts.csv` | `contract_value` | controlled synthetic |
| `accounts.csv` | `contract_start_date` | controlled synthetic |
| `accounts.csv` | `contract_end_date` | controlled synthetic |
| `accounts.csv` | `last_activity_date` | controlled synthetic |
| `accounts.csv` | `customer_since` | controlled synthetic |
| `account_notes.csv` | `note_id` | controlled synthetic |
| `account_notes.csv` | `account_id` | derived |
| `account_notes.csv` | `note_date` | controlled synthetic |
| `account_notes.csv` | `author` | controlled synthetic |
| `account_notes.csv` | `note_type` | controlled synthetic |
| `account_notes.csv` | `note_text` | controlled synthetic |
| `account_notes.csv` | `synthetic_flag` | controlled synthetic |
| `account_notes.csv` | `source_signal_ids` | derived evidence link |
| `email_logs.csv` | `email_id` | controlled synthetic |
| `email_logs.csv` | `account_id` | derived |
| `email_logs.csv` | `date` | controlled synthetic |
| `email_logs.csv` | `sender_type` | controlled synthetic |
| `email_logs.csv` | `subject` | controlled synthetic |
| `email_logs.csv` | `body` | controlled synthetic |
| `email_logs.csv` | `sentiment_hint` | derived |
| `email_logs.csv` | `synthetic_flag` | controlled synthetic |
| `email_logs.csv` | `source_signal_ids` | derived evidence link |
| `account_bridge.csv` | `account_name` | controlled synthetic |
| `account_bridge.csv` | `notes` | controlled synthetic |

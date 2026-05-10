# Source Inventory

This final source inventory summarizes the Phase 0 demo data package used by Nelson DSS.

| Processed file | Primary source | Rows | Notes |
|---|---|---:|---|
| `accounts.csv` | DataCo SMART Supply Chain plus controlled synthetic B2B account context. | 50 | See `field_mapping.md` and `processed_schema.md`. |
| `orders.csv` | DataCo SMART Supply Chain transformed into canonical order history. | 1897 | See `field_mapping.md` and `processed_schema.md`. |
| `support_tickets.csv` | Customer Support Ticket Dataset transformed and redacted. | 200 | See `field_mapping.md` and `processed_schema.md`. |
| `account_notes.csv` | Controlled synthetic account-management notes grounded in order/support source signals. | 100 | See `field_mapping.md` and `processed_schema.md`. |
| `email_logs.csv` | Controlled synthetic email-style records grounded in order/support source signals. | 100 | See `field_mapping.md` and `processed_schema.md`. |
| `account_bridge.csv` | Deterministic source-customer to synthetic account bridge. | 50 | See `field_mapping.md` and `processed_schema.md`. |

## Raw Source Boundary

- Raw Kaggle files remain local under `data/raw/` and are not committed.
- `tokenized_access_logs.csv` is deferred from MVP and tracked in the future expansion backlog.
- Processed exports exclude raw customer identity/contact columns and use redacted support descriptions.

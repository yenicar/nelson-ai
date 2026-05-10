# Data Statement

Nelson DSS Phase 0 uses a hybrid demo data strategy: public Kaggle-derived operational/support data plus controlled synthetic B2B account context.

## Kaggle-derived Data

- DataCo SMART Supply Chain records provide sampled source customers, order history, delivery timing, product categories, regions, and shipment signals.
- Customer Support Ticket Dataset records provide support categories, ticket status/priority inputs, satisfaction hints, and redacted support descriptions.

## Controlled Synthetic Data

- Account names, account owners, segments, contract fields, and customer-success context are controlled synthetic demo fields.
- Account notes and email logs are controlled synthetic records generated from structured order/support signals.
- Every synthetic note/email includes `synthetic_flag` and `source_signal_ids`.

## Privacy Boundary

- Raw source files are excluded from git.
- Raw customer identity/contact fields are excluded from processed exports.
- Support descriptions are redacted before processed export.

## Canonical Customer 2000 Dataset

- `data/customer_2000/` is the new canonical derived dataset for the richer Nelson DSS customer-intelligence build.
- It is derived from public Kaggle source datasets and intentionally preserves customer names, emails, addresses, and location fields for demo realism.
- `Customer Password` from the raw DataCo file is intentionally excluded because it is security-adjacent and not useful for dashboard analysis.
- Source attribution and license notes should be kept with the derived dataset when it is committed or shared.
- The older `data/processed/` files remain legacy MVP demo artifacts until backend and frontend readers are migrated to `data/customer_2000/`.

## Validation Summary

- validation_pass: true
- critical_failure_count: 0
- warning_count: 0

## Processed Files

| File | Rows |
|---|---:|
| `accounts.csv` | 50 |
| `orders.csv` | 1897 |
| `support_tickets.csv` | 200 |
| `account_notes.csv` | 100 |
| `email_logs.csv` | 100 |
| `account_bridge.csv` | 50 |

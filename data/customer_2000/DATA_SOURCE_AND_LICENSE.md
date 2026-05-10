# Customer 2000 Data Source And License

This folder contains a derived Nelson DSS demo dataset built from public Kaggle source datasets.

## Sources

- DataCo SMART Supply Chain dataset from Kaggle / DataCo source distribution.
- Customer Support Ticket Dataset from Kaggle.

## PII Boundary

The derived customer dataset intentionally keeps public-source customer names, emails, address/location fields, and support-ticket identity fields for local demo realism.

The raw DataCo `Customer Password` field is not included in the derived customer dataset because it is security-adjacent and not needed for analytics or visualization.

## Use

This dataset is for Nelson DSS product development, dashboard demos, and portfolio-style analysis. It should not be represented as real Nelson customer data.

## Synthetic Enrichment

The following files are scenario-driven synthetic enrichments generated from customer, order, and support signals:

- `customer_notes.csv`
- `customer_email_logs.csv`
- `customer_review_logs.csv`
- `customer_contacts.csv`
- `customer_adjustments.csv`
- `engagement_events.csv`
- `fulfillment_events.csv`
- `review_outcomes.csv`

They are designed to simulate realistic CRM, support, retention, fulfillment, and customer-success complexity. They should be treated as demo records, not real communications or real operational events.

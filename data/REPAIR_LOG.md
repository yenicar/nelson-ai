# Repair log

_Anchor: TODAY = 2026-05-09._


## A. Date rebase

- Orders + fulfillment shifted by **3111 days**.
- Support tickets shifted by **1584 days**.
- review_outcomes: **2048 completed** (rebased into past), **534 pending** (NULL date, follow-up required).

## B. Ticket columns

- Dropped broken timestamp columns: ['first_response_time', 'time_to_resolution'].

## C. Email lineage

- Emails with refs: was 0, now 17,262 (100%). 0 remain empty (no matching note scenario).

## D. Volume diversification

- customer_notes: 10,147 → 6,014 rows. Volume now correlates with risk_band (low=1-4, mid=4-8, high=8-12).
- customer_email_logs: 17,262 → 11,462 rows. Volume now correlates with risk_band (low=2-8, mid=8-14, high=14-20).

## E. Ticket spread

- Tickets redistributed across customers. Distribution (tickets per customer): {0: np.int64(1397), 1: np.int64(170), 2: np.int64(6), 3: np.int64(126), 4: np.int64(132), 5: np.int64(138), 6: np.int64(9), 7: np.int64(8), 8: np.int64(14)}. 1,397 customers now have **zero tickets** (healthy).
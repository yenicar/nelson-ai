# AccountIQ-DSS Data Setup Instructions

## Purpose

Use this file together with:

1. `AccountIQ_DSS_High_Fidelity_Data_Compilation_Plan.md`
2. `00_fetch_raw_data.py`
3. Phase 1 Build Spec
4. Codex Implementation Prompt
5. Data Amendment files

Goal:

Set up the raw Kaggle datasets and prepare the project for Phase 0 Data Preparation.

---

# 1. What These Files Do

## `00_fetch_raw_data.py`

This script uses `kagglehub` to fetch the two Kaggle datasets and save local raw CSV copies.

Datasets:

1. DataCo SMART Supply Chain  
   `shashwatwork/dataco-smart-supply-chain-for-big-data-analysis`

2. Customer Support Ticket Dataset  
   `suraj520/customer-support-ticket-dataset`

It saves them into:

```text
data/raw/dataco_supply_chain/DataCoSupplyChainDataset.csv
data/raw/customer_support_tickets/customer_support_tickets.csv
```

It also creates:

```text
data/raw/raw_download_log.json
data/raw/dataco_supply_chain/README_source.md
data/raw/customer_support_tickets/README_source.md
```

---

# 2. Where to Put the Files

Inside your AccountIQ-DSS project folder, create:

```text
accountiq-dss/
  data/
    scripts/
```

Place the API script here:

```text
accountiq-dss/data/scripts/00_fetch_raw_data.py
```

Place this instruction file anywhere useful, recommended:

```text
accountiq-dss/data/data_dictionary/00_data_setup_instructions.md
```

---

# 3. Install Dependencies

From the project root:

```bash
pip install "kagglehub[pandas-datasets]"
```

If you are already using your project environment:

```bash
pip install -r requirements.txt
pip install "kagglehub[pandas-datasets]"
```

Recommended: add this to `requirements.txt`:

```text
kagglehub[pandas-datasets]
```

---

# 4. Run the API Fetch Script

From the project root:

```bash
python data/scripts/00_fetch_raw_data.py
```

Expected result:

```text
data/raw/
  raw_download_log.json

  dataco_supply_chain/
    README_source.md
    DataCoSupplyChainDataset.csv

  customer_support_tickets/
    README_source.md
    customer_support_tickets.csv
```

---

# 5. Important Rule

Do not manually edit files in:

```text
data/raw/
```

Raw files are the source-of-truth copies.

All cleaning/transformation should happen in:

```text
data/interim/
data/processed/
```

---

# 6. How This Connects to the Data Plan

After running `00_fetch_raw_data.py`, follow the high-fidelity data plan in this order:

```text
00_fetch_raw_data.py
→ 01_inspect_raw_data.py
→ 02_sample_accounts.py
→ 03_build_bridge.py
→ 04_transform_orders.py
→ 05_transform_support.py
→ 06_generate_synthetic_text.py
→ 07_validate_processed_data.py
→ 08_export_data_dictionary.py
```

---

# 7. Phase 0 Data Pipeline

## Step 0: Fetch raw data

```bash
python data/scripts/00_fetch_raw_data.py
```

Output:

```text
data/raw/dataco_supply_chain/DataCoSupplyChainDataset.csv
data/raw/customer_support_tickets/customer_support_tickets.csv
```

## Step 1: Inspect raw data

Next script to build/run:

```bash
python data/scripts/01_inspect_raw_data.py
```

Purpose:

- count rows
- count columns
- inspect column names
- detect likely ID/date/text/numeric fields
- identify possible PII
- create mapping candidates

Expected outputs:

```text
data/interim/raw_data_profile.json
data/data_dictionary/source_inventory_draft.md
```

## Step 2: Sample accounts

```bash
python data/scripts/02_sample_accounts.py
```

Purpose:

- select 50 source customers/accounts
- include high, medium, and low risk profiles
- preserve enough order history
- reserve A1001 to A1005 showcase stories

Expected outputs:

```text
data/interim/account_candidate_pool.csv
data/interim/sampled_dataco_orders.csv
```

## Step 3: Build account bridge

```bash
python data/scripts/03_build_bridge.py
```

Purpose:

- map source customer IDs to AccountIQ-DSS account IDs
- create A1001 to A1050
- generate B2B account names
- assign owners, segments, regions, contract dates

Expected outputs:

```text
data/processed/account_bridge.csv
data/processed/accounts.csv
```

## Step 4: Transform orders

```bash
python data/scripts/04_transform_orders.py
```

Purpose:

- convert DataCo records into AccountIQ-DSS `orders.csv`

Expected output:

```text
data/processed/orders.csv
```

## Step 5: Transform support tickets

```bash
python data/scripts/05_transform_support.py
```

Purpose:

- convert support dataset into `support_tickets.csv`
- map tickets to accounts
- normalize severity/status
- preserve source ticket IDs

Expected output:

```text
data/processed/support_tickets.csv
```

## Step 6: Generate synthetic notes/emails

```bash
python data/scripts/06_generate_synthetic_text.py
```

Purpose:

- generate account notes and email logs aligned with structured evidence
- preserve `source_signal_ids`

Expected outputs:

```text
data/processed/account_notes.csv
data/processed/email_logs.csv
```

## Step 7: Validate processed data

```bash
python data/scripts/07_validate_processed_data.py
```

Purpose:

- check required columns
- check dates
- check foreign keys
- check duplicate IDs
- check source traceability
- check PII patterns

Expected outputs:

```text
outputs/validation_report.json
data/data_dictionary/validation_report.md
```

## Step 8: Export data dictionary

```bash
python data/scripts/08_export_data_dictionary.py
```

Purpose:

- document final schemas
- document source-to-target mapping
- document synthetic fields
- create final data statement

Expected outputs:

```text
data/data_dictionary/source_inventory.md
data/data_dictionary/field_mapping.md
data/data_dictionary/processed_schema.md
data/data_dictionary/synthetic_data_statement.md
data/data_dictionary/data_statement.md
```

---

# 8. Final Processed Dataset Expected by the App

After Phase 0, the app/build pipeline should use:

```text
data/processed/accounts.csv
data/processed/orders.csv
data/processed/support_tickets.csv
data/processed/account_notes.csv
data/processed/email_logs.csv
data/processed/account_bridge.csv
```

These replace the older placeholder names:

```text
sample_support.csv → support_tickets.csv
sample_delivery.csv → orders.csv
sample_notes.csv → account_notes.csv
```

---

# 9. How to Use With Codex or Antigravity

Open the workspace with these files included:

```text
AccountIQ_DSS_High_Fidelity_Data_Compilation_Plan.md
PHASE_1_BUILD_SPEC_DATA_AMENDMENT.md
CODEX_IMPLEMENTATION_PROMPT_DATA_AMENDMENT.md
00_fetch_raw_data.py
00_data_setup_instructions.md
```

Then prompt Codex/Antigravity:

```text
Read the AccountIQ-DSS High-Fidelity Data Compilation Plan and the Data Amendment files.

Start with Phase 0 only.

Create the required data folder structure.
Place 00_fetch_raw_data.py in data/scripts/.
Do not modify raw data manually.
After fetching raw data, build 01_inspect_raw_data.py.
Stop after each script/milestone and summarize:
1. files created or changed
2. commands run
3. outputs generated
4. issues/blockers
5. next recommended step

Do not start Streamlit app development until Phase 0 processed data is validated and frozen.
```

---

# 10. Final Freeze Criteria

Do not move to application build until all of these exist:

```text
data/processed/accounts.csv
data/processed/orders.csv
data/processed/support_tickets.csv
data/processed/account_notes.csv
data/processed/email_logs.csv
data/processed/account_bridge.csv
outputs/validation_report.json
data/data_dictionary/data_statement.md
```

And all are true:

```text
1. Raw Kaggle files are saved unchanged.
2. Source inventory is complete.
3. Processed files share valid account_id relationships.
4. A1001 to A1005 have clear demo stories.
5. Every synthetic note/email has source_signal_ids.
6. Validation report has zero critical failures.
7. Data statement clearly separates Kaggle-derived data from synthetic demo data.
8. The processed dataset can be loaded by the AccountIQ-DSS MVP.
```

---

# 11. Why This Matters

This setup gives the project:

- reproducible data acquisition
- clear raw/interim/processed separation
- Kaggle source attribution
- realistic B2B account layer
- evidence-backed synthetic text
- validation-ready processed data
- stronger final documentation
- cleaner handoff to Codex/Antigravity

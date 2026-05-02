# Pre-Arranged Funeral Estimate Tool

A guided web app for **David Crymble & Sons Funeral Directors** that walks a family through the steps of pre-arranging a funeral and produces a downloadable PDF estimate.

All pricing is read from a Google Sheet, so the office can update prices without touching the code or redeploying.

---

## What it does

1. Captures customer details (name, contact, branch, who the arrangement is for).
2. Steps through funeral type → service → coffin → transport → additional services → estimated third-party disbursements.
3. Shows a running total throughout, and a full itemised summary at the end.
4. Generates a branded PDF estimate the customer can download.
5. Offers an "Email Estimate Request" button that opens the customer's email app pre-filled with their selections.

The PDF clearly states it is **an estimate only, not a confirmed funeral contract**.

---

## Tech stack

- **Next.js 14** (App Router) + **React 18**
- **Tailwind CSS** for styling
- **Papaparse** for parsing the published Google Sheet CSV
- **jsPDF + jspdf-autotable** for client-side PDF generation
- Deploys to **Vercel** with zero configuration

---

## Setup — local development

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env.local
# (then edit .env.local — see "Connecting your Google Sheet" below)

# 3. Run the dev server
npm run dev
```

Open <http://localhost:3000> and you should see the estimate tool.

---

## Connecting your Google Sheet

The app reads pricing from a **published Google Sheet CSV**. No API key, no service account — just a public CSV URL.

### Step 1 — create the sheet

Make a Google Sheet with a tab called `Pricing` (or any name) containing these columns in this order:

| Column        | Required | Notes                                                                |
|---------------|----------|----------------------------------------------------------------------|
| `category`    | yes      | One of: `funeral_type`, `service_choice`, `coffin`, `transport`, `additional_service`, `disbursement` |
| `item_name`   | yes      | The label shown to customers (e.g. "Solid oak coffin").              |
| `description` | no       | Short description shown under the option.                            |
| `price`       | yes      | A number in GBP. Use `0` for "price on application" / no extra cost. |
| `active`      | yes      | `TRUE` to show the option, `FALSE` to hide it.                       |
| `sort_order`  | yes      | A number — lower numbers appear first within their category.         |

A starter sheet you can copy/paste is included at [sample-pricing.csv](sample-pricing.csv).

### Step 2 — publish to the web as CSV

In Google Sheets:

1. **File → Share → Publish to web**
2. Choose the **Pricing** tab and the **Comma-separated values (.csv)** format
3. Click **Publish** and copy the URL

It will look like:

```
https://docs.google.com/spreadsheets/d/e/2PACX-1vXXXXXX.../pub?gid=0&single=true&output=csv
```

### Step 3 — paste it into your env file

In `.env.local`:

```env
NEXT_PUBLIC_SHEETS_CSV_URL="https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv"
```

Restart the dev server and the prices on every step will now come from your sheet. Edits in the sheet appear within ~5 minutes (Google's publishing cache).

> If you'd rather use the Google Sheets API instead of publishing, swap the URL for any other CSV endpoint your sheet exposes (e.g. `https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&sheet=Pricing` — works on link-shared sheets, no publishing required).

---

## Environment variables

| Variable                          | Required | Purpose                                                       |
|-----------------------------------|----------|---------------------------------------------------------------|
| `NEXT_PUBLIC_SHEETS_CSV_URL`      | yes      | Published CSV URL of your pricing sheet.                      |
| `NEXT_PUBLIC_ESTIMATE_EMAIL`      | no       | Recipient address for "Email Estimate Request". Defaults to `enquiries@davidcrymble.co.uk`. |
| `NEXT_PUBLIC_BUSINESS_PHONE`      | no       | Phone number shown in the header / PDF. Defaults to `028 9038 1080`. |
| `NEXT_PUBLIC_USE_FALLBACK_PRICING`| no       | Set to `true` only for development — uses bundled illustrative prices if the sheet fails. |

All variables are `NEXT_PUBLIC_*` because the sheet is fetched in the browser — no server-side secrets are needed.

---

## Deploying to Vercel

1. Push the project to GitHub (or any Git provider).
2. In Vercel, click **New Project** and import the repo.
3. Vercel auto-detects Next.js — no configuration needed.
4. In **Project Settings → Environment Variables**, add at minimum:
   - `NEXT_PUBLIC_SHEETS_CSV_URL`
5. Click **Deploy**.

Future price updates just require editing the Google Sheet — no redeploy needed.

---

## Updating prices (for the office)

1. Open the published Google Sheet.
2. Edit any row's `price`, or add a new row with the right `category` and `sort_order`.
3. Save. Within a few minutes the live estimate tool will reflect the change.

To **temporarily hide** an option, set its `active` cell to `FALSE`.
To **remove** an option permanently, delete the row.

---

## File map

```
app/
  layout.tsx          — site shell, header, footer
  page.tsx            — the multi-step form (orchestrates everything)
  globals.css         — Tailwind layer + button/option styles
components/
  ProgressBar.tsx     — top progress bar
  StepNav.tsx         — Back / Continue buttons
  RunningTotal.tsx    — sticky running estimate
  OptionList.tsx      — single- and multi-select option cards
lib/
  types.ts            — shared TypeScript types
  sheets.ts           — fetches and parses the published Google Sheet CSV
  estimate.ts         — turns form state into priced line items + totals
  pdf.ts              — generates the branded PDF estimate
  fallbackPricing.ts  — minimal illustrative prices used only when the sheet
                        cannot be reached AND fallback mode is enabled
sample-pricing.csv    — starter sheet content you can paste into Google Sheets
```

---

## Notes & guard-rails

- **Prices are never hard-coded in app code.** All money values live in the Google Sheet.
- If the sheet fails to load and fallback mode is off, the customer sees a friendly error message asking them to phone the office, rather than a broken form.
- The PDF and the on-screen summary both display the standard disclaimer:
  > *This document is an estimate only and is based on the choices selected at the time of preparation. Final costs may vary depending on personal choices, third-party fees, cemetery or crematorium charges, and any additional requirements. For an accurate funeral quotation, please speak directly with the team at David Crymble & Sons Funeral Directors.*
- The estimate is **never** described as a confirmed funeral contract.
- The PDF is generated entirely in the browser — no customer details are sent to any server.

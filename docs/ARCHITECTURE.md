# Architecture and accounting rules

Status: approved in Phase 0 and implemented through Phase 10. The posting functions (migration 9) apply the movements below;
the same rules exist as pure code in `src/lib/ledger/postings.ts` and both are tested against the same hand-derived cases
(`tests/fixtures/posting-cases.json`). **The database functions have never been run.**

## Principles

1. Recordkeeping only. Staff enter transactions by hand. There is no GCash integration.
2. Money is integer centavos everywhere. Philippine time (`Asia/Manila`) defines the business date.
3. Balances are never stored; they are sums of immutable ledger lines.
4. Posted records are never edited or deleted. Mistakes are corrected by a void (a mirror-image reversal) and, if needed, a new transaction.
5. All financial writes will go through database functions that check permission, lock, validate, post and audit in one database transaction. The browser never writes to financial tables directly.

## Ledger sign convention

`amount_cents > 0` is a debit and `< 0` is a credit; every journal entry sums to zero (enforced by a deferred database trigger).
Assets and expenses grow with debits; income and equity grow with credits. The `account_balances` view applies that rule.

## How each event moves the books (illustrative amounts)

| Event | Cash | GCash | Load | Owed by customers | Profit effect |
|---|---:|---:|---:|---:|---:|
| Cash-in ₱1,000, ₱20 fee, paid in cash | +1,020 | −1,000 | | | +20 |
| Cash-in, customer pays ₱500 now, rest on credit | +500 | −1,000 | | +520 | +20 |
| Cash-out ₱1,000, fee deducted from payout | −980 | +1,000 | | | +20 |
| Load ₱100 face, cost ₱97, sold for cash | +100 | | −97 | | +3 |
| Repayment ₱300 in cash | +300 | | | −300 | 0 |
| Expense ₱50 paid in cash | −50 | | | | −50 |
| Owner forgives ₱10 of a debt | | | | −10 | −10 |
| Owner adds ₱2,000 capital to the drawer | +2,000 | | | | 0 |
| Count finds the drawer ₱5 over (daily closing) | +5 | | | | not in profit |

- Customer debt is never cash. It lives only in the receivables account.
- Principal is never profit. Profit = fees + load margin − provider cost − expenses. If a load sale has no cost, profit is shown as incomplete, not guessed.
- A repayment never creates revenue. Opening debts are offset against an opening-balance equity account, so collecting them is never income.
- A void posts an exact negation linked to the original. The database rejects a reversal that is not an exact mirror, and an entry can be reversed only once.
- Reconciliation variance = actual − expected. Confirming a closing posts an explicit, reasoned variance entry; a balance is never overwritten. A finalized closing is immutable and is corrected by a new revision.

## What you can adjust, and what stays fixed

You asked that service fees and transaction rules reflect your actual practice. They do, in these ways.

**Adjustable (stored as data, not code):**

- **How a fee is collected, per service:** `on_top` (customer pays principal + fee) or `deducted` (fee comes out of what the customer receives). The default for each service lives in `app_settings`, it can be overridden on any single transaction, and **each transaction records the mode and fee it actually used**, so changing a rule later never rewrites history. Defaults are only assumptions: cash-in `on_top`, cash-out `deducted`.
- **The fee schedule (`fee_rules`):** flat amount and/or percentage (in basis points), by amount range, with effective dates. The database refuses two active rules that cover the same amount on the same dates. Percentage rounding (`half_up`, `down`, `up`) is a setting.
- **Provider cost per transaction** (optional), for when GCash charges or rebates you.
- **Load products (`load_products`):** network, whether load comes straight from GCash or from a prepaid load balance, and cost as a share of face value, or per-sale entry.
- **Policies:** whether balances may go negative, whether backdating is allowed, whether a repayment may exceed the debt, whether voids need the owner, whether a GCash reference is required.
- **Low-balance thresholds** per account (unset until you set them).

**Fixed integrity rules (not configurable, by design):** the ledger always balances; principal is never profit; repayments are never revenue; debt is never cash; posted records are never edited; voids are mirror-image reversals; finalized closings are immutable.

**Timing:** Phase 1 stores these settings and tables. The screens to edit them arrive with the forms that use them (fee rules and load products in Phase 6, thresholds in Phase 7). The posting functions that apply them are Phase 3.

## Concurrency and double-posting

- Every transaction carries a client-generated `idempotency_key` (unique). A repeated submit returns the existing record instead of posting twice.
- Posting functions (Phase 3) lock the touched account rows in a fixed order before checking balances, so two staff cannot spend the same float.

## Authentication and authorization (Phase 2, written)

Supabase Auth with email and password; the owner creates staff accounts and decides each person's permissions. Cookie sessions via `@supabase/ssr`, httpOnly. Four layers (middleware, server guards, row-level security, no-write grants plus functions); full detail in `SECURITY.md`. Phase 2 grants the browser roles **SELECT only**; every write goes through a function. Staff and permission changes already work this way; transaction posting (Phase 3) will follow the same pattern.

## Customer history and debts

A customer's page and the Transactions page read the same `transactions` rows. A debt's outstanding balance is derived (`debt_balances` view: original − posted repayments + posted adjustments). A paid debt keeps its record. The receivables ledger and the debt records are two derivations that Phase 5 will reconcile with a test.


## Definitions used on screen

| Word | Meaning |
|---|---|
| Transaction volume | The amounts that moved (principal). Not revenue, not profit. |
| Earned | Service fees, mobile-load margin (selling price minus cost), and voluntary tips recorded on debt repayments. |
| Costs | Provider costs, operating expenses and debt write-offs. |
| Net profit | Earned minus costs. Counting differences are reported separately and are not in it. |
| Expected balance | Sum of the ledger lines for the account (entries dated on or before the day, for a closing). |
| Variance | Counted minus expected: zero is balanced, positive is more than expected, negative is less. |

## "principal", fees, and the two fee modes

"Principal" is always the headline amount the customer asked for. The fee is charged **on top** or **deducted**:

| | On top | Deducted |
|---|---|---|
| Cash-in | customer pays amount + fee in cash; wallet sends the amount | customer pays the amount; wallet sends amount − fee |
| Cash-out | wallet receives amount + fee; customer gets the amount in cash | wallet receives the amount; customer gets amount − fee in cash |

## Daily closing and amendments

The person counts cash, GCash and load. Saving counts refreshes the expected balances and the counts together. Closing
(1) refuses if the books moved since the counts were saved, (2) books each difference as a reasoned entry dated on the closing
day (using a narrow internal allowance so a non-owner can close a past day), (3) locks the closing. An amendment is a NEW
revision created by the owner with a reason; it reopens only that day; the old closing is kept. Debits and credits for
every difference go to a "Reconciliation variance" account, never to a customer or to fees.

## Where each rule is enforced

| Rule | Database trigger or constraint | Posting/closing function | Pure code (tested here) |
|---|---|---|---|
| Entries balance to zero | yes | | yes |
| Reversal mirrors the original, once | yes | yes | yes |
| No edits or deletes of posted records | yes | | |
| Overdraft protection | | yes | |
| Idempotent submit | unique key | yes | |
| Closed days take no postings | | yes | |
| Permissions | row-level security | yes | yes |
| Principal is not profit; repayment is not income | | yes | yes |

# Known limitations and decisions

## Not verified
- Nothing in the database or the web app has been run by the author. See `docs/TESTING.md` for the exact list of what has.
- Package versions were chosen from memory and never installed, so the first `npm install`, `typecheck` and `build` may need small fixes.
- The Taste Skill inspector, real-device layout, screen readers, keyboard order on every page and 200% zoom have not been checked.
- Not reviewed by an accountant, a lawyer, or a security professional. No tax, BIR or BSP reporting.

## Business rules chosen (you can change them in Settings or by asking)
- Fees are either **on top** or **deducted**; each transaction records the mode it used. Default guesses: cash-in on top, cash-out deducted.
- **Mobile-load cost is required** to post a sale (it decides the margin and what leaves your balance). There is no "profit unknown" state.
- Balances cannot go below zero unless the owner overrides, with a reason, for that one transaction.
- A repayment larger than what is owed is **rejected**; there is no customer credit balance.
- Only the owner can record expenses, move money between accounts, add or take out capital, enter opening balances, void, adjust debts, amend closed days, and change settings.
- Reducing a debt (write-off) is a **cost** that lowers profit. Increasing one is a correction and counts as income in that entry; use it only for amounts that were really left out.
- Opening debts have an **unknown date** and are aged as "Date unknown". Your reported ₱1,400.00 starting capital is kept as a note only and is not a balance.
- A void is dated **today**. So a closed day's own figures stay as closed, and today's profit is reduced by a void of an earlier day's transaction.
- Profit figures are by the date of the ledger entry; counts and volumes are by the transaction's business date.
- Daily closing covers cash, GCash and load. The business day is the Philippine calendar day.

## Features not built
- Self-service password change after the forced first one (the owner can re-add the account); two-factor sign-in; audit of sign-ins and sign-outs; inactivity time-out.
- Editing a customer's debts' dates, merging duplicate customers, customer credit, supplier tracking, multiple shops, SMS or receipts.
- PDF statements (print the statement page, or use CSV). Charts other than the profit chart.
- Offline use. The app needs the internet and the database to be up.
- More than 200 active customers in the pickers (a text filter narrows them, but the list is capped at 200 per load); the staff list shows 200 accounts.
- Customer search is a plain "contains" match on name or contact number; the only fuzzy matching is the duplicate-name warning.
- Void requests from staff have no queue or notification. They show as a "Void requested" tag in the Transactions list, and the owner approves by opening the transaction and voiding it.

## Technical
- Reports cover at most one year per view; exports of transactions are capped at 5,000 rows.
- The report-only CSP does not block anything yet (`docs/DEPLOYMENT.md` explains how to enforce it).
- The `account_balances` view shows account names with zero balances to someone without balance access (balances themselves stay hidden).
- Database functions run with elevated rights and each checks the caller; a bug there would bypass row-level security, so those functions are the most important thing to review.
- Restoring sign-ins into a brand-new hosted project is the least certain part of disaster recovery.

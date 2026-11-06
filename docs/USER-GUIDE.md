# User guide

For the owner and staff. Use **test data** until `docs/TESTING.md` has been completed and passes.

## First-time setup (owner, in this order)

1. **Staff.** Staff Management > add each person with a temporary password (12+ characters, told to them in person) and tick only what their job needs. They choose their own password at first sign-in.
2. **Settings.**
   - *Fee and balance rules*: how fees are usually charged (on top, or deducted). Leave "allow balances below zero" off.
   - *Fee rules*: your usual fees by amount range (flat, percentage, or both). Without rules you type the fee each time.
   - *Mobile load products*: networks you sell, and what you pay as a percentage of the load amount.
   - *Expense categories*, and *Low-balance warnings* for the cash drawer, GCash wallet and load balance (your own numbers).
3. **Opening balances.** Count the cash in the drawer, the GCash wallet and the load balance, then New transaction > *Opening balances*. These are real counts. Your reported starting capital is **not** used as a balance.
4. **Opening debts.** Debts > *Opening debts* > import. It lists exactly what was reported (11 customers, 11,349.00), says the date is unknown, and cannot be imported twice.
5. Check Dashboard: the three balances are what you counted, and "Owed to you" is the imported total.

## Every day

**Recording** (staff with permission): New transaction.
- *Cash-in*: the customer hands you cash and you send GCash. *Cash-out*: the customer sends GCash and you hand over cash.
- The amount is what the customer asked for. The fee is either **on top** (they pay or send extra) or **deducted** (they receive less). The box "What will happen" shows the effect on cash, GCash, owed money and profit before you save.
- If a customer will pay later, enter the amount under *Left unpaid* and choose the customer. It becomes a debt, not cash.
- *Mobile load*: always enter what the load cost you; that is what decides your margin.
- A cash advance (utang) is under Debts > New cash advance; repayments under Debts > Record repayment.
- If the screen says there is not enough in a balance, something is wrong with the entry or the counts. Only the owner can override, and must give a reason.

**Closing the day** (owner, or staff with the closing permission): Daily closing.
1. Count the real cash, GCash and load balance.
2. Type each count. The page says "balanced", "X more than expected" or "X less than expected". A reason is required for any difference.
3. *Save counts* as often as you like; *Close the day* asks you to confirm. Each difference becomes a recorded adjustment, and the day is locked.
4. If the books change while you are counting, closing is refused. Save your counts again.

## Fixing mistakes

- **Never edit.** Open the transaction and **void** it (owner), with a reason. The original stays and a reversing entry is added today. Then enter the correct transaction.
- Staff with permission can **request** a void; the owner approves.
- A debt with repayments cannot be voided until those repayments are voided.
- A **closed day** takes no new transactions. The owner can *Amend this closing* (with a reason), fix the day, then count and close it again. Both versions are kept.
- A debt that will not be collected: Debts > open the debt > *Adjust the debt* > reduce (owner, with a reason). It is recorded as a cost; it never touches cash.

## Customers

Add customers with just a name; a contact number is optional. The app warns about similar names. A customer's page keeps
three things apart: **what they owe now**, **their debt history**, and **their transaction history** (volume, not debt).
Archiving keeps all history. A statement for any period is under *Statement* (print or CSV); if the period starts before
your records do, it says the opening balance is not known instead of guessing.

## Reports

Reports shows, for any period up to a year: transaction **volume** (money that passed through, not income), what was
**earned** (fees and load margin), **costs**, and **net profit**. Counting differences are shown separately. Every table has a CSV export.

## Rules the app will not bend

Debt is never counted as cash. The amount of a cash-in or cash-out is never profit. A repayment is never income. A posted
transaction is never edited or deleted. A closed day is locked. Voids, adjustments, closings, overrides and staff changes are recorded with who did them (sign-ins are not recorded yet).

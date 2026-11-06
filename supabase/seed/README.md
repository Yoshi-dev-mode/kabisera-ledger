# Opening customer debts

`opening-debts.json` holds the eleven opening debts exactly as you reported them (total ₱11,349.00).

Rules this data follows:

- They are **opening balances**, not transactions. No date, service fee, GCash reference, staff member or payment history is invented. `reported_on` is `null` and `date_known` is `false` on purpose.
- **Cee jay** and **Cj** are two different customers with different `seed_key` values. Never merge them.
- Your reported starting capital (₱1,400.00) is **not** in this file and is **not** a cash or GCash balance.
- Real opening balances for the cash drawer, GCash wallet and load balance are entered separately by you, after counting. Nothing in this repository assumes them.

**Status: data only.** The tables that will hold these debts exist (Phase 1 migrations), but the import
routine is Phase 5 because it must post through the ledger functions built in Phase 3. It will be
idempotent: it keys on `seed_key` and on the import-batch checksum, so re-running it cannot duplicate
a debt. The unit test `tests/unit/opening-debts.test.ts` already checks the total and the Cee jay / Cj split.

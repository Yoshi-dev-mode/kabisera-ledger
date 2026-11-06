# Testing status

An honest record of what has and has not been run. The author's environment had **no network, no PostgreSQL and no
browser pointed at the app**, so packages could not be installed and the database and web app could never be started.

"Stand-in runner" = a small throwaway script that runs the real test files without installing Vitest. It is not Vitest.
"Stand-in typecheck" = TypeScript checking the project's own code against loose placeholder types for Next.js, React,
Supabase and zod. It catches mistakes in how the project's own files fit together, **not** how they call those libraries.

## Actually run (in the author's environment)

| Check | Result |
|---|---|
| Strict TypeScript (`noUncheckedIndexedAccess` on) over the pure-logic code and all unit tests | 0 errors |
| Stand-in typecheck over **every TypeScript source file** (pages, actions, middleware, forms, shell), including unused imports and variables | 0 errors apart from known placeholder artifacts |
| A parsed scan of every JSX file for characters ESLint rejects in text, and a scan for unused imports | clean |
| 191 unit tests across 18 files (money, time, CSV, accounting rules, fee tiers, statements, filters, parsers, entry previews, alerts, closing rules, opening-debts validation, permissions, redirects, cookies, navigation) | all passed, using the stand-in runner |
| **Deliberate breakage** of the code, 43 ways (rounding, signs, time zone, CSV safety, fee modes, profit, statement dates, void handling, variance sign, week start, report limits, alerts, picker, opening-debt checks, CSV labels...) | 42 caught by a failing test; the 43rd (removing one of two redundant checks on redirect paths) changes nothing observable |
| Taste Skill source lint, app mode | 0 failures, 0 warnings |
| `tools/check-project.mjs`: 11 structural checks (client components never reach server-only code, server-action files export only what Next.js allows, route handlers, secrets, migrations' references and order, security-definer functions pin their search path, every browser-callable function checks the caller, no write grants to the browser roles, SQL checks roll back) | 11 of 11 pass; and it caught all 6 problems planted in a copy |
| Contrast ratios for all 20 colour pairs (`docs/design/ACCESSIBILITY.md`) | all pass after darkening form outlines |
| Independent arithmetic check of the duplicate-name similarity threshold | as intended ("Cj" vs "Cee jay" = 0.10) |
| SQL: balanced quotes, parentheses and dollar-quotes in every migration and test script; every referenced table, type and function exists earlier | no problems. **Not a syntax check.** |

### Defects that this checking found and fixed (so you can judge how much it caught)
- `build` would have failed on an untyped parameter in the server Supabase client (found by you).
- The cookie-hardening helper's return type collapsed to `never` for some inputs.
- Customer-picker bug: typing in the filter could silently change who a transaction was recorded for. Now covered by tests.
- File-name slug turned "Ñandú" into "n-and-u".
- A closing design flaw: re-opening the page would have disturbed saved counts. Redesigned.
- Opening-debts import would have worked locally and failed once deployed (a file read that serverless hosting does not ship). Fixed in `next.config.ts`.
- Input outlines failed the 3:1 contrast minimum. Darkened.
- An unused import that would have failed `next build` (ESLint runs during the build), an unused function parameter, and a chart tooltip type that was narrower than the library's.
- A trigram threshold sitting exactly on a boundary; several mistakes in my own SQL test scripts (reused idempotency keys, off-by-one counts, overlapping fee ranges, wrong expected cash).

## Written but NOT run

| Item | Why | How you run it |
|---|---|---|
| `npm install`, `typecheck`, `lint`, `build` against the real libraries | no network | checklist below |
| Real Vitest: 19 files, 195 tests (the 191 above plus 4 environment tests that have **never run in any form**) | not installed | `npm test` |
| **All 14 migrations**: 78 functions, triggers, row-level security, grants | no PostgreSQL | `npm run db:reset` |
| **All 8 SQL check scripts**, 432 assertions between them | no PostgreSQL | Studio SQL editor, one by one |
| Sign-in, sessions, middleware, forced password change, Staff Management, every page and form, the phone navigation, printing | needs the running app | the acceptance walk-through below |
| Playwright: 15 tests per browser profile (7 run without credentials, 8 need an owner account), 2 profiles | no browser against the app | `npm run test:e2e` |
| Backup script and restore procedure | no database | `docs/BACKUP-RESTORE.md` |
| Report-only CSP behaviour, cookies on HTTPS, deployment | needs a browser and a host | `docs/DEPLOYMENT.md` |
| Taste inspector, tabular digits in the font, real-device layout, screen readers | needs the running app | not yet possible |

The SQL scripts are the most important thing to run. The accounting rules were tested as pure code against 20
hand-derived cases, and the database functions are tested against **the same 18 cases** (generated into
`phase3_ledger.sql`), but only once the scripts have actually run can you know the database agrees.

## Checklist for your Windows PC (in order)

1. `node --version` is v20.9 or higher.
2. Unzip, `npm install`. Expect no ERESOLVE errors. (If there are, send the whole message.)
3. `npx supabase init`, edit `supabase\config.toml` (`enable_signup = false`, `minimum_password_length = 12`), `npm run db:start`, `npm run db:reset`. Expect all 14 migrations to apply with no error.
4. **Run the 8 SQL scripts** in `supabase\tests\` in Studio's SQL Editor, in this order, **before creating any real data**. Each ends with an intentional error whose message is the report; it must say `0 failure(s)` and every line must start with `PASS`. They roll back, so you can run them one after another on the same empty database.

   | Script | Checks |
   |---|---|
   | `phase1_invariants.sql` | ledger guards, immutability, audit, deny-by-default |
   | `phase2_policies.sql` | who can read what, staff functions, last-owner protection |
   | `phase3_ledger.sql` | every posting rule against the hand-derived cases; overdraft, idempotency, permissions, voids |
   | `phase4_customers.sql` | duplicates, search, archive, history visibility |
   | `phase5_debts.sql` | opening-debts import (11 customers, 11,349.00, no date, no duplicates), repayments, write-offs |
   | `phase6_settings.sql` | fee rules, settings, products, thresholds |
   | `phase7_dashboard.sql` | balances, today's profit, alerts, running balances |
   | `phase8_closing.sql` | counting, differences, locking, amendments, reports |

5. `npm run verify` (typecheck, lint, tests, project checker). Expect **19 test files, 195 tests passed** and `11 of 11 checks passed`.
6. `npm run build` succeeds.
7. Create the owner (README), add the service key, `npm run dev`, then do the **acceptance walk-through** below with test data.
8. Optional: `npx playwright install chromium`, then `npm run test:e2e` (without credentials, expect 14 passed and 16 skipped; with `E2E_OWNER_*` set against a local database, expect all to run, apart from the phone-only test on desktop).
9. Take a backup and **restore it** into a throwaway database (`docs/BACKUP-RESTORE.md`).

Send back the result of each step; for a failure paste the complete text. If a SQL script reports a `FAIL` line, that line
names the rule that is wrong.

## Acceptance walk-through (as the owner, on a throwaway database)

| # | Do this | You should see |
|---|---|---|
| 1 | New transaction > Opening balances: cash 10,000, GCash 5,000, load 2,000 | Dashboard shows exactly those three balances; "Owed to you" 0 |
| 2 | Settings: add a cash-in rule: from 0, flat 20, charged on top | rule listed as active |
| 3 | Cash-in 1,000 (fee fills in as 20.00) | preview: cash +1,020.00, GCash −1,000.00, profit +20.00. After saving: cash 11,020.00, GCash 4,000.00 |
| 4 | Cash-out 500, fee 10, deducted | cash 10,530.00, GCash 4,500.00, today's fees 30.00 |
| 5 | Add customer "Ken"; cash-in 1,000, fee 20, **unpaid 520**, customer Ken | cash rises by only 500.00; Ken owes 520.00; "Owed to you" 520.00; cash is not increased by the 520 |
| 6 | Debts > Record repayment, Ken, 300 cash | Ken owes 220.00; cash +300.00; **today's profit unchanged** |
| 7 | Try repaying 500 for Ken | refused: more than he owes |
| 8 | Open the transaction from step 3 > Void with a reason | status Voided; a reversing entry; balances move back; Ken's history unaffected |
| 9 | Try to void Ken's credit sale | refused until the repayment is voided |
| 10 | Debts > Opening debts > import; import again | 11 customers, 11,349.00 added to "Owed to you", "Date unknown"; the second import says nothing was added |
| 11 | Daily closing: count the cash 5.00 too high, with no reason | cannot close; the page says "5.00 more than expected" |
| 12 | Add the reason and close the day | closed; adjusting entry shown; cash now equals your count; posting a new transaction for that day is refused |
| 13 | Amend the closing (owner) | revision 2; the old closing remains in the history |
| 14 | Reports for this month | volume, earned, costs and profit in separate groups; CSV downloads open in Excel |
| 15 | Add a staff member with only "Record transactions"; sign in as them | forced new password; only Dashboard, New transaction (cash-in/out/load) and their own transactions visible; Debts, Reports, Settings, Staff are not |

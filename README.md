# Kabisera Ledger

Recordkeeping for a small GCash cash-in, cash-out and mobile-load business: customers and their full history,
customer debts and repayments, separate cash / GCash / load balances, service fees, daily closing, and reports.

Independent tool. **Not an official GCash product** and not connected to GCash: every transaction is entered by hand.

## Status: all 10 phases written. Almost none of it has run yet.

This was built in an environment with no network, no PostgreSQL and no browser against the app. So:

- **Run and passing there:** the pure logic (money, accounting rules, statements, filters, parsers, CSV, alerts, closing rules): 191 unit tests, strict TypeScript, deliberate-breakage checks, the Taste Skill lint, a project checker, and structural checks of the SQL.
- **Written but never run:** all 14 database migrations, all 8 SQL check scripts, every page and form, sign-in, the build, ESLint, real Vitest, and Playwright.

Read `docs/TESTING.md` for exactly what was and was not run, and follow the checklist there before you trust any number
this app shows. **Do not enter real customer data until the checklist passes.** Opening cash, GCash and load balances are
never assumed: you enter them after counting.

## What it does

| Area | What you get |
|---|---|
| Sign-in and roles | Email and password; owner and staff; per-person permissions; disabled people see nothing |
| Transactions | Cash-in, cash-out, mobile load, cash advance, repayment, expense, balance moves, owner capital; live "what will happen" preview; double-submit protection; voids by reversal |
| Customers | Search, duplicate warnings, full profile with every transaction, debt ledger, statements, CSV export, archive and restore (history kept) |
| Debts | Owed-to-you total, age of unpaid debts, due dates, partial and full repayment, owner-only write-offs and corrections, safe opening-debts import |
| Balances | Cash drawer, GCash wallet and load balance kept apart; every movement with a running balance; low-balance warnings you set |
| Daily closing | Count the real balances; differences need a reason and become explicit adjusting entries; closed days are locked; owner-only amendments |
| Reports | Summary (volume, earned, costs, profit kept apart), activity by day/week/month, cash/GCash/load movement, by staff, counting differences, CSV for each |
| Settings | Fee rules (flat, percentage, ranges, dates), default fee modes, load products, expense categories, warning levels, policies |

How it keeps the books honest is in `docs/ARCHITECTURE.md`. In short: money is whole centavos; balances are always added
up from an unchangeable ledger; a customer's debt is never counted as cash; the amount of a cash-in or cash-out is never
profit; a repayment is never income; nothing posted is edited or deleted; mistakes are reversed, with a reason.

## What you need (Windows 10/11, PowerShell)

```powershell
winget install OpenJS.NodeJS.LTS      # Node.js 20.9 or newer
winget install Git.Git
winget install Docker.DockerDesktop   # to run the database on your own PC
node --version                        # v20.9 or higher
```

Close and reopen PowerShell after installing.

## Set up and check (in this order)

```powershell
cd path\to\kabisera-ledger
npm install
Copy-Item .env.example .env.local
npx supabase init                  # first time only; answer N to the VS Code / Deno questions
```

1. Open `supabase\config.toml` and under `[auth]` set `enable_signup = false` and `minimum_password_length = 12`.
2. Start the database and apply all 14 migrations (this wipes the LOCAL database, which is fine now):

```powershell
npm run db:start
npm run db:reset
npm run db:status                  # copy the API URL and anon key into .env.local
```

3. **Before creating anything real**, run all 8 SQL check scripts in `supabase\tests\` (see `docs/TESTING.md`). Each one
   must report `0 failure(s)` with every line `PASS`. They roll back, so the database stays empty.
4. Check the code:

```powershell
npm run verify                     # typecheck, lint, 195 unit tests, project checker
npm run build
```

5. Create your owner account and start the app:
   - Studio (`http://127.0.0.1:54323`) > Authentication > Users > **Add user**, tick *Auto Confirm User*.
   - Run `supabase\bootstrap\first-owner.sql` in the SQL Editor after putting your name and email in it.
   - Put the `service_role` key from `npm run db:status` into `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (only needed for Staff Management).

```powershell
npm run dev                        # http://localhost:3000
```

6. Walk through `docs/USER-GUIDE.md` ("First-time setup" and the daily routine) with **test data**.
7. Optional browser tests: `npx playwright install chromium`, then `npm run test:e2e` (add `E2E_OWNER_EMAIL` and `E2E_OWNER_PASSWORD` for the signed-in ones; use a local database only).

If any step fails, copy the **complete** error text. The most likely first problems are dependency versions in `npm install`, a type error in `npm run typecheck` or `build` (this is the first run against the real library types), and SQL that has never run.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | run, build, serve |
| `npm run verify` | typecheck + lint + unit tests + project checker |
| `npm run check` | the dependency-free project checker alone (`tools/check-project.mjs`) |
| `npm test` / `test:e2e` | unit tests / browser tests |
| `npm run db:start` `stop` `status` `reset` `push` | Supabase CLI helpers |
| `.\tools\backup-database.ps1` | make a backup .zip (see `docs/BACKUP-RESTORE.md`) |

## Folder map

```
src/app            pages, server actions, route handlers (Next.js App Router)
src/components     ui (base), shell (sidebar, phone nav), ledger (tables, forms), entry (transaction forms), settings
src/lib            money, time, csv, accounting rules, fees, statements, filters, parsers, auth, Supabase clients
src/middleware.ts  session refresh, sign-in redirect, report-only CSP
supabase/migrations  the database, 14 files, in order
supabase/tests     8 SQL check scripts          supabase/seed  opening debts (data)       supabase/bootstrap  first owner
tests/unit  tests/e2e  tests/fixtures            tools  project checker, backup script, test generator
docs               USER-GUIDE, ARCHITECTURE, DATABASE, SECURITY, TESTING, DEPLOYMENT, BACKUP-RESTORE, KNOWN-LIMITATIONS, design/
```

## Safety notes

- `.env.local` holds secrets and is git-ignored; `.env.example` has no real values. The `service_role` key bypasses all access rules: never paste it anywhere except `.env.local` or your host's secret settings.
- The app never asks for or stores a customer's GCash MPIN, OTP or password.
- Backups contain customer names, numbers and financial records (and password hashes if sign-ins are included). Keep them private and encrypted.
- Not tax or accounting advice, and not reviewed by an accountant or a security professional.

More: `docs/KNOWN-LIMITATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`.

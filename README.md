<div align="center">

# Kabisera Ledger

### A clearer way to run the counter.

Record cash-in, cash-out, mobile load, customer credit and daily balances in one ledger built for small service businesses.

<br />

![Next.js 15](https://img.shields.io/badge/Next.js-15-111111?logo=next.js)
![React 19](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase)
![Status](https://img.shields.io/badge/status-prototype%20in%20progress-d99b29)

<br />

[Product overview](#the-product) · [Capabilities](#what-it-can-do) · [Ledger principles](#designed-for-financial-clarity) · [Run locally](#run-it-locally) · [Project status](#readiness-and-next-steps)

</div>

---

## The product

Small GCash and mobile-load counters handle several kinds of money at once: cash in the drawer, funds in a GCash wallet, load inventory, service fees and amounts customers still owe. Kabisera Ledger brings those records into one place and keeps the important figures distinct.

The goal is a practical daily workflow: record a transaction, see its effect before saving, track what customers owe, and compare expected balances with the real count at closing.

> **Independent recordkeeping software.** Kabisera Ledger is not made by, affiliated with or connected to GCash. Transactions are entered manually; the app does not move, process or verify money through GCash.

## What it can do

| Area | What’s included |
| --- | --- |
| **Daily transactions** | Cash-in, cash-out, mobile-load sales, expenses, cash advances, repayments, transfers and capital movements |
| **Customer records** | Customer profiles, transaction history, outstanding debt, statements and CSV exports |
| **Separate balances** | Cash drawer, GCash wallet and load balance, each with its own ledger and optional low-balance threshold |
| **Daily closing** | Enter real counts, compare them with expected balances, explain differences and keep a closing history |
| **Business reports** | Review transaction volume, fees, load margin, costs and net profit over a selected period |
| **Owner and staff access** | Give staff only the permissions needed for their work; keep owner-only actions separate |
| **Review before posting** | Transaction forms preview the expected balance and profit effects before an entry is saved |

## Designed for financial clarity

Kabisera Ledger is built around a few distinctions that are easy to lose in a simple cashbook:

- **Customer debt is not available cash.** An unpaid amount is tracked as a receivable, separately from the drawer and wallet.
- **Transaction volume is not profit.** The principal amount is money that moved; earnings come from fees and load margin, less costs.
- **Repayment is not new income.** It reduces the amount a customer owes.
- **Balances come from recorded movements.** They are calculated from ledger entries rather than manually overwritten.
- **Corrections preserve history.** Posted records are designed to be corrected with a reasoned reversal, keeping the original entry visible.
- **Counts are reconciled explicitly.** A difference between expected and counted money is recorded with a reason instead of being hidden.

The app stores money in integer centavos and uses the Philippine business date (`Asia/Manila`). See [Architecture and Accounting Rules](docs/ARCHITECTURE.md) for the detailed model.

## A simple operating loop

```text
Record a transaction  →  Review its effect  →  Keep customer debt separate
          ↓                                                ↓
     Close the day  ←  Compare expected balances with the real count
```

## Technical foundation

| Layer | Implementation |
| --- | --- |
| Web app | Next.js 15, React 19, TypeScript |
| Interface | Tailwind CSS 4, responsive navigation, Recharts |
| Data and authentication | Supabase, PostgreSQL, Supabase Auth |
| Input handling | Server actions, Zod, strict peso-to-centavo parsing |
| Access controls | Server-side permission checks and database row-level security |
| Ledger writes | PostgreSQL functions designed to validate and post financial movements atomically |
| Project checks | Vitest, Playwright and structural/security checks |

The intended data flow keeps financial writes behind authenticated server and database checks; browser code does not write directly to ledger tables. Read the [Security Model](docs/SECURITY.md) and [Database Guide](docs/DATABASE.md) for implementation details and open review items.

## Run it locally

### Requirements

- Node.js **20.9 or newer** and npm
- Docker Desktop for the local Supabase services
- Git

### Setup

```powershell
git clone https://github.com/Yoshi-dev-mode/kabisera-ledger.git
cd kabisera-ledger
npm install
Copy-Item .env.example .env.local
npm run db:start
npm run db:status
```

Use the local API URL and anon key shown by `db:status` to fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. Then apply the local migrations:

```powershell
npm run db:reset
```

Create the first owner in local Supabase Studio: add a confirmed Auth user, update the email and display name in `supabase/bootstrap/first-owner.sql`, then run that SQL in the Studio SQL Editor. The app cannot create owner accounts by design. Start the app with `npm run dev` and open [http://localhost:3000](http://localhost:3000).

Local Supabase authentication settings and the full first-run workflow are in the [User Guide](docs/USER-GUIDE.md) and [Testing Guide](docs/TESTING.md). Never commit `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` is needed to add staff; it bypasses row-level security, so keep it server-side and secret. `DATABASE_URL` is only needed for database backup and restore tasks.

### Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local web app |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run verify` | Run the project’s combined checks |
| `npm run build` | Create a production build |
| `npm run db:reset` | Recreate the local database from migrations and seed data |

## Readiness and next steps

**This repository is a prototype in progress.** The project’s validation notes say the real database migrations, installed-library build, and browser workflows have not yet been run end to end. The database and security design therefore still need hands-on validation before the app is used with live business or customer records.

Use test data until the [Testing Guide](docs/TESTING.md) passes, the app completes its acceptance walkthrough, and the backup-and-restore procedure has been exercised. The project has not been independently reviewed by an accountant, lawyer or security professional. See [Known Limitations](docs/KNOWN-LIMITATIONS.md) for current scope and open items.

## Explore the project

- [User Guide](docs/USER-GUIDE.md) — setup and everyday workflows
- [Architecture](docs/ARCHITECTURE.md) — ledger model and accounting rules
- [Database](docs/DATABASE.md) — schema and relationships
- [Security](docs/SECURITY.md) — authentication, permissions and data handling
- [Testing](docs/TESTING.md) — validation record and acceptance checklist
- [Deployment](docs/DEPLOYMENT.md) — staging and deployment guidance
- [Backup and Restore](docs/BACKUP-RESTORE.md) — backup and recovery procedure
- [Known Limitations](docs/KNOWN-LIMITATIONS.md) — current boundaries and outstanding work

---

<div align="center">

**Kabisera Ledger** · Clearer records for everyday counter transactions.

</div>

# Kabisera Ledger

<p align="center">
  <strong>A practical financial ledger for small GCash and mobile-load businesses.</strong>
  <br />
  Track transactions, customer debts, balances, service fees, and daily performance in one place.
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss" />
  <img alt="Status" src="https://img.shields.io/badge/status-in%20development-orange" />
</p>

---

## Overview

**Kabisera Ledger** is a full-stack recordkeeping and debt management application built for small businesses that provide GCash cash-in, cash-out, and mobile-load services.

It gives business owners a centralized place to record customer transactions, monitor outstanding balances, manage cash and digital-wallet funds, configure service fees, and review daily financial activity. The goal is to make everyday bookkeeping clearer, more consistent, and easier to audit.

> Kabisera Ledger is an independent recordkeeping tool. It is **not an official GCash product**, is not affiliated with GCash, and does not connect to GCash. Transactions and balances are entered and maintained manually.

## Features

| Module | Capabilities |
| --- | --- |
| **Dashboard** | At-a-glance business activity, balances, earnings, and alerts |
| **Transaction ledger** | Record cash-in, cash-out, mobile load, advances, repayments, expenses, transfers, and capital contributions |
| **Customer management** | Search customers, view transaction history, manage customer records, and export statements |
| **Debt tracking** | Monitor outstanding receivables, due dates, partial repayments, write-offs, and opening debts |
| **Balance monitoring** | Track cash, GCash, and load balances separately, with running balances and low-balance alerts |
| **Daily closing** | Reconcile counted balances, record differences with reasons, and review closing history |
| **Reports and exports** | Review financial activity over time and export records to CSV |
| **Settings and access control** | Configure fee rules, products, categories, thresholds, staff accounts, and permissions |

## Accounting principles

The application is designed around a few important bookkeeping rules:

- **Customer debt is not cash.** Unpaid amounts are tracked separately from available balances.
- **Transaction principal is not profit.** Earnings come from service fees and load margins, less costs and expenses.
- **Repayments are not new income.** They reduce the customer's outstanding debt.
- **Balances are derived from ledger entries.** They are not arbitrary values that can be overwritten.
- **Posted transactions are preserved.** Corrections use reasoned reversals instead of silently editing or deleting financial history.
- **Daily closing is a reconciliation.** Differences are recorded explicitly rather than hidden by changing a balance.

Money is represented in integer centavos, and business dates use the Philippine time zone (`Asia/Manila`). For the detailed accounting model, see [Architecture and Accounting Rules](docs/ARCHITECTURE.md).

## Technology stack

| Layer | Technologies |
| --- | --- |
| Framework | Next.js 15, React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Backend and database | Supabase, PostgreSQL |
| Authentication | Supabase Auth, `@supabase/ssr` |
| Forms and validation | React Hook Form, Zod |
| Charts | Recharts |
| Testing | Vitest, Playwright |
| Runtime | Node.js 20.9+ |

## Getting started

### Prerequisites

- Node.js **20.9.0 or newer**
- npm
- Git
- Docker Desktop (for running the local Supabase database)

### 1. Clone the repository

```powershell
git clone https://github.com/Yoshi-dev-mode/kabisera-ledger.git
cd kabisera-ledger
```

### 2. Install dependencies

```powershell
npm install
```

### 3. Configure environment variables

Create your local environment file:

```powershell
Copy-Item .env.example .env.local
```

Fill in the required Supabase values in `.env.local`. Never commit this file or expose your `service_role` key.

### 4. Initialize and start Supabase locally

If this is your first local setup:

```powershell
npx supabase init
```

In `supabase/config.toml`, configure authentication as described in the setup guide (including disabling public sign-ups and setting a minimum password length).

Then start and reset the local database:

```powershell
npm run db:start
npm run db:reset
npm run db:status
```

Use the local API URL and anon key reported by the status command in `.env.local`.

### 5. Verify and run the application

```powershell
npm run verify
npm run build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Important:** Before using real business or customer records, complete the database checks and acceptance walkthrough in [Testing Guide](docs/TESTING.md). Use test data while validating the application.

For the complete Windows setup, owner-account bootstrap, and first-run instructions, follow the repository's setup notes and [User Guide](docs/USER-GUIDE.md).

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build the production application |
| `npm start` | Start the production server |
| `npm run typecheck` | Run the TypeScript compiler |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run verify` | Run typecheck, lint, unit tests, and project checks |
| `npm run check` | Run project structure and safety checks |
| `npm run db:start` | Start the local Supabase stack |
| `npm run db:stop` | Stop the local Supabase stack |
| `npm run db:status` | Show local Supabase service status |
| `npm run db:reset` | Reset the local database and apply migrations |
| `npm run db:push` | Push local migrations to the linked Supabase project |

## Documentation

More detailed documentation is available in the `docs/` directory:

- [User Guide](docs/USER-GUIDE.md) — using the application and its daily workflow
- [Architecture](docs/ARCHITECTURE.md) — ledger design and accounting rules
- [Database](docs/DATABASE.md) — database structure and relationships
- [Security](docs/SECURITY.md) — authentication, authorization, and data protection
- [Testing](docs/TESTING.md) — test coverage, validation status, and acceptance checklist
- [Deployment](docs/DEPLOYMENT.md) — deploying the application and configuring Supabase
- [Backup and Restore](docs/BACKUP-RESTORE.md) — protecting and restoring business records
- [Known Limitations](docs/KNOWN-LIMITATIONS.md) — current constraints and considerations

## Security and data handling

- The application does not request or store customer GCash MPINs, OTPs, or passwords.
- Keep all environment variables and service-role credentials private.
- Backups may contain customer details and financial records; store them securely.
- Configure authentication and access permissions before inviting staff.
- This project has not been independently audited by a security professional.

## Project status

Kabisera Ledger is under active development. Features, database migrations, and documentation are being refined and validated. Refer to the [Testing Guide](docs/TESTING.md) and [Known Limitations](docs/KNOWN-LIMITATIONS.md) for the current validation record and outstanding considerations.

Do not use the application as the sole record of a live business until the database checks, application tests, deployment checks, and backup/restore process have been completed successfully.

## Disclaimer

Kabisera Ledger is an independent project for manual business recordkeeping. It is not affiliated with, endorsed by, or integrated with GCash or its operators. It does not initiate, process, or verify GCash transactions. Users are responsible for entering accurate records and maintaining their own financial backups.

---

<p align="center">
  Built to make small-business recordkeeping more organized, transparent, and manageable.
</p>

# Backup and restore

**Status: written, never run.** Do a backup and a full RESTORE test on your local database before you depend on this.
A backup you have never restored is a hope, not a backup.

## What needs protecting

| What | Where it lives |
|---|---|
| Customers, transactions, ledger, debts, closings, audit log, settings | the database `public` schema |
| Owner and staff sign-in accounts | Supabase's `auth` schema (profiles point at them by id) |
| The opening-debts data file and all code | your project folder (keep it in git) |
| `.env.local` and the service-role key | **not** in git; keep them in a password manager |

## Making a backup

Local database (Docker running, `npm run db:start`):

```powershell
.\tools\backup-database.ps1
```

A hosted project (use the **direct** connection string from the project's database settings):

```powershell
$env:DATABASE_URL = "postgresql://postgres:YOUR-PASSWORD@db.YOUR-REF.supabase.co:5432/postgres"
.\tools\backup-database.ps1 -Target url
Remove-Item Env:DATABASE_URL
```

It writes `backups\kabisera-YYYYMMDD-HHMMSS.zip` containing three files: the structure, the business data, and the
sign-in accounts. Add `-ExcludeSignIns` to leave the sign-ins out.

**The zip is sensitive.** It holds customer names and numbers, every transaction, and password hashes. A .zip made this
way is **not encrypted**. Move it to an encrypted drive (BitLocker) or into a password-protected archive, never e-mail it,
and never put it in git (`backups\` and `*.dump` are already in `.gitignore`).

### How often

Take one at the end of every working day you closed, and keep several generations (for example the last 7 days, 4 weeks
and 12 months). If you use a paid Supabase plan, also turn on its own automatic backups and check how long it keeps them
(on the free plan do not assume any). Your own zip is the copy you control.

You can schedule it with Windows Task Scheduler: action *Start a program*, program `powershell.exe`, arguments
`-ExecutionPolicy Bypass -File "C:\path\to\kabisera-ledger\tools\backup-database.ps1" -Target url`, start in the project
folder. The connection string must then be available to the task as an environment variable for your account.

## Restoring (practise on a throwaway database first)

You need `psql`. If it is not installed, run it inside Docker instead (shown below).

1. **Unzip** the backup into a private folder.
2. **Start a clean database.** Locally: `npm run db:reset` (this empties the local database and applies all 14 migrations, which creates the structure, so you normally do NOT need the structure file).
3. **Load the sign-ins first, then the data** (the data refers to sign-in accounts):

```powershell
$url = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"    # local default; confirm with npm run db:status
psql $url -v ON_ERROR_STOP=1 -f .\kabisera-YYYYMMDD-HHMMSS-3-signins.sql
psql $url -v ON_ERROR_STOP=1 -f .\kabisera-YYYYMMDD-HHMMSS-2-data.sql
```

Without `psql`, using Docker (adjust the folder path):

```powershell
docker run --rm -v "${PWD}:/b" postgres:17 psql "postgresql://postgres:postgres@host.docker.internal:54322/postgres" -v ON_ERROR_STOP=1 -f /b/kabisera-YYYYMMDD-HHMMSS-3-signins.sql
```

4. **Check it.** Sign in as the owner. Compare with what you wrote down before the backup: the three balances on the Dashboard, the "Owed to you" total, and the most recent closed day. Open one customer's profile and one transaction.

### If the data file will not load

Read the **first** error, not the last. Because the ledger protects itself (it refuses unbalanced entries and edits), a
restore into a database that already has data will fail on purpose; restore into an empty one. If it still fails, keep
the backup untouched and ask for help with the complete error text.

### Restoring into a brand-new hosted project

Create the project, set the auth options in `docs/DEPLOYMENT.md`, run `npm run db:push` to create the structure, then
load the sign-ins and data as above using that project's direct connection string. Hosted projects restrict some
operations on the `auth` schema, so this path is the least certain; if it fails, the fallback is: restore the data
without the sign-ins, recreate the owner and staff accounts, and re-link their profiles. Practise this before you need it.

## After a restore

Run `supabase\tests\phase2_policies.sql` only on a throwaway copy. The SQL check scripts assume an empty database and
create test rows (rolled back), so never run them against the live one.

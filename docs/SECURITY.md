# Security model

Access is enforced in **four independent layers**. Hiding a button is never the protection.

1. **Middleware** (`src/middleware.ts`): refreshes the session, sends signed-out visitors to `/login`.
2. **Server guards** (`src/lib/auth/session.ts`): every page calls `requireSession()` / `requirePermission()` / `requireOwner()`; every server action re-checks the caller itself.
3. **Database row-level security** (migration 8): even a bug in layers 1 and 2 cannot read rows the person's permissions do not allow.
4. **Database functions and grants**: browser roles hold SELECT only. There are no INSERT/UPDATE/DELETE privileges for them anywhere; writes go through functions that check the owner again.

## Roles and permissions

- **Owner:** every permission, implicitly. Created only by SQL (`supabase/bootstrap/first-owner.sql`), never by the app. The last active owner cannot be deactivated, demoted or deleted (database trigger).
- **Staff:** only the permissions the owner ticks (9 available, listed in `src/lib/auth/permissions.ts`; a test checks the list matches the database constraint).
- **Deactivated:** sees no business data at all, immediately, even with a still-valid session.
- Staff cannot edit profiles, so they cannot promote themselves. Only an owner can call the staff functions, and those cannot modify owners.

## Sessions and cookies

- Sign-in happens on the server (a server action), never in browser scripts.
- Session cookies are written **httpOnly**, **SameSite=Lax**, **Secure in production**, path `/`.
- The server verifies identity with `auth.getUser()` (asks the auth server), never by trusting a cookie.
- The browser Supabase client is not used for sign-in; nothing in page scripts can read the session.
- Sign-out is a server action (POST) and clears the cookies.

## Sign-in hardening

- One generic error message for any failed sign-in; it never says whether an email exists.
- The "where to go after sign-in" value is validated (`safeNextPath`), so a crafted link cannot send someone to another website.
- **Sign-ups must be disabled** in Supabase (see README step "Lock down sign-ups"). The app has no sign-up page, but the Supabase API is reachable with the public key, so the setting itself must be off. Even if someone did register, a person with no profile can read nothing.
- New staff get a temporary password set by the owner and **must choose their own** before they can use the app. The owner never learns it.
- Password rules: 12+ characters, at most 72 bytes, no repeats, sequences, common choices or parts of the email. Set Supabase's own minimum to 12 as well.

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` is read only in server-only files (`env.server.ts`, `admin.ts`) and used only to create, ban or unban sign-in accounts after the caller is verified as an owner. It is never used for business data, never sent to the browser, and must stay out of git, screenshots and chat.
- `.env.local` is git-ignored; `.env.example` is blank.

## Content-Security-Policy

A CSP with a per-request nonce is sent as **`Content-Security-Policy-Report-Only`**: violations appear in the browser console, nothing is blocked. This is deliberate for now; a mistake in an enforced CSP can blank the whole app. Before switching to enforcing (planned with the UI polish phase) open each screen with the console open and fix any reported violation. Some reports may be noise from framework scripts; judge each one.

## Audit

Staff creation, permission changes, activation and settings changes are logged with the owner as actor (the database functions run inside the owner's session). Customer contact numbers and notes are deliberately not copied into the log. **Sign-ins and sign-outs are not logged yet.**

## Known limitations

- No two-factor sign-in yet (recommended for the owner; Supabase supports it).
- No inactivity timeout or forced sign-out of other devices; a deactivated person is blocked from data immediately by the database, and their sign-in is banned so they cannot refresh the session.
- Staff cannot change their own password after the first forced change (a settings screen comes later). The owner can reset one by deleting and re-adding the account.
- Owners are created and removed by SQL only.
- Failed sign-in attempts are rate-limited by Supabase Auth, not by this app; check your project's limits.
- Someone with no `accounts.view` permission who queries the `account_balances` view sees the 11 account names with zero balances (the balances themselves are hidden by row-level security). The app never calls it for them.
- The staff list shows the first 200 accounts only.
- Nothing here has been security-tested by a third party, and none of it has run yet (see `docs/TESTING.md`).


## Added with the ledger, customers, debts, settings, closing and reports

- **No direct writes.** The browser roles hold SELECT only. Every change goes through a database function that checks the caller (`tools/check-project.mjs` verifies that each browser-callable function does, and that none is granted INSERT/UPDATE/DELETE).
- **Elevated functions.** The functions run with their owner's rights so they can show staff names and do atomic multi-table writes. Each pins its `search_path`, checks `auth.uid()`/permissions first, and validates its inputs. They are the most important code to review.
- **One narrow internal allowance.** The daily-closing function sets a transaction-local flag (`kabisera.closing`) so a non-owner closer can date an adjusting entry on the closing day and so that entry is not blocked by overdraft protection. A signed-in browser user cannot set it: it is set and cleared inside the function.
- **Double-posting.** Every transaction form carries a one-time key created when the page loads; a repeated submit returns the original record.
- **Immutable records.** Ledger entries, audit rows, allocations and adjustments cannot be edited or deleted, even by the database owner through normal SQL (triggers); a void adds a mirror-image entry; closed days are locked; an amendment is a new revision.
- **What is audited:** posts, voids and void requests, overdraft overrides (with the reason), debt adjustments and due dates, opening-debts imports, closings and amendments, customer changes (contact numbers and notes are not copied into the log), staff and permission changes, settings and fee-rule changes.
- **Input handling.** Amounts are parsed strictly as whole centavos; free text is length-limited; search text is escaped so `%` and `_` are literal; route parameters are checked as UUIDs; exports neutralise spreadsheet formulas and never include contact numbers; error messages shown to people come only from our own plain-language database messages.
- **Exports.** CSV exports re-check the permission in the route handler, so a link shared with someone without access returns 403.

## Still open

- Sign-ins and sign-outs are not audit-logged. No two-factor sign-in. No inactivity time-out.
- The CSP is report-only until you enforce it (`docs/DEPLOYMENT.md`).
- Nothing has been run, penetration-tested or reviewed by a security professional. Treat `docs/TESTING.md` as a gate, not a formality.

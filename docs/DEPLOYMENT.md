# Deployment

**Status: written, never run.** Complete `docs/TESTING.md` on your own PC first. Deploy to a **staging** project and check
it before pointing real staff at anything. Nothing here has been security-reviewed by a third party.

## What you are setting up

| Piece | Suggested service | Notes |
|---|---|---|
| Database and sign-in | Supabase (hosted), region nearest you (Singapore) | free plans can pause and have limited backups: check the current terms |
| The web app | Any Node 20+ host that runs Next.js, for example Vercel | the files in this folder deploy as a normal Next.js app |
| Domain and HTTPS | your host provides HTTPS; use your own domain if you want | the session cookie is only marked Secure on HTTPS |

## 1. Supabase project

1. Create the project and a strong database password. Save it in a password manager.
2. **Authentication settings** (dashboard > Authentication):
   - turn **off** "Allow new users to sign up" (important: the app has no sign-up page, but the Supabase API is reachable with the public key);
   - set the minimum password length to **12**;
   - consider requiring MFA for the owner when your plan supports it.
3. Create the structure from your PC:

```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npm run db:push                    # applies all 14 migrations to the REAL project
```

4. **Run the SQL check scripts on a separate staging project**, not on the one that will hold real data. They assume an empty database and insert test rows (rolled back).
5. Create the owner: dashboard > Authentication > Users > Add user (tick *Auto Confirm User*), then run `supabase\bootstrap\first-owner.sql` in the SQL editor.
6. Copy the API URL and the `anon` key (Project Settings > API) and the `service_role` key (keep this one secret).

## 2. The app

Set these environment variables in your host's settings (never in a file in the repository):

| Variable | Value | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the project URL | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon` key | no, but only safe because every table is protected |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key | **yes**, mark it sensitive; only used to create and disable staff sign-ins |
| `DATABASE_URL` | direct connection string | **yes**, only if you run backups from the host (usually not) |

Build command `npm run build`, start command `npm start`. The file `supabase/seed/opening-debts.json` is shipped on
purpose (see `outputFileTracingIncludes` in `next.config.ts`) so the owner-only opening-debts import works once deployed.
The server's time zone does not matter: every business date is calculated in Philippine time in the code and the database.

## 3. First deploy checklist

- [ ] Sign in as the owner over HTTPS; the address bar shows a lock.
- [ ] Browser developer tools > Application > Cookies: the session cookies are `HttpOnly`, `Secure` and `SameSite=Lax`.
- [ ] Open `/api/health`: it says `status: ok` and shows only true/false for the two public settings.
- [ ] Open `/dashboard` signed out in a private window: you are sent to `/login`.
- [ ] Add a test staff member with one permission; sign in as them in another browser; confirm they see only what you allowed and are made to choose a new password.
- [ ] Try the "Opening debts" import on staging and confirm the total and that a second import adds nothing.
- [ ] Take a backup and **restore it** to a throwaway database (`docs/BACKUP-RESTORE.md`).
- [ ] Look at the browser console on every screen for `Content-Security-Policy-Report-Only` messages.

## 4. Turning the content-security-policy on

The app sends the policy in **report-only** mode: violations appear in the console but nothing is blocked. Once the
console is clean on every screen, change `CSP_HEADER` in `src/middleware.ts` from `Content-Security-Policy-Report-Only`
to `Content-Security-Policy`, redeploy, and click through every screen again. A mistake in an enforced policy can blank
the whole app, so keep the previous deployment available to roll back to. The built-in "not found" page is static and
cannot carry the per-request nonce; check it explicitly.

## 5. Updating later

1. Put the new version on staging; run `npm run verify` and the SQL checks there.
2. `npm run db:push` applies only new migrations. **Never edit a migration that has been applied**; add a new one.
3. Take a backup immediately before deploying a database change.
4. Deploy the app. If something is wrong, redeploy the previous version; database changes need a new migration to undo.

## 6. Running costs and limits to check yourself

Check the current free-tier limits of the database host (pausing after inactivity, storage, backups) and of the app host
before relying on them for a business. A paused database means the shop cannot record transactions.

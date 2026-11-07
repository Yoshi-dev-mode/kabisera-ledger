import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { parseProfileRow, type Profile } from "@/lib/auth/permissions";
import { requireOwner } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { EditStaffForm, CreateStaffForm } from "./staff-forms";

export const metadata: Metadata = { title: "Staff Management" };

function Pill({ tone, children }: { tone: "positive" | "negative" | "warning" | "neutral"; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex h-5 items-center rounded-chip px-1.5 text-[12px] leading-4"
      style={{ background: `var(--pill-${tone}-bg)`, color: `var(--pill-${tone}-ink)` }}
    >
      {children}
    </span>
  );
}

async function loadEmails(): Promise<{ emails: Map<string, string>; adminReady: boolean }> {
  const emails = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const user of data?.users ?? []) {
      if (user.email) emails.set(user.id, user.email);
    }
    return { emails, adminReady: true };
  } catch {
    return { emails, adminReady: false };
  }
}

export default async function StaffPage() {
  await requireOwner();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("profiles")
    .select("id, display_name, role, is_active, permissions, must_change_password")
    .order("role", { ascending: true })
    .order("display_name", { ascending: true });

  const people = ((rows ?? []) as unknown[])
    .map((row) => parseProfileRow(row))
    .filter((p): p is Profile => p !== null);
  const { emails, adminReady } = await loadEmails();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <PageHeading icon="staff">Staff Management</PageHeading>
        <p className="max-w-[60ch] text-[14px] text-muted-foreground">
          Only you, as owner, can add staff and decide what each person may do. Every change is recorded in the audit log.
        </p>
      </header>

      {!adminReady ? (
        <p role="status" className="max-w-[70ch] rounded-control bg-[var(--pill-warning-bg)] px-3 py-2 text-[13px] text-[var(--pill-warning-ink)]">
          Adding staff and showing email addresses needs SUPABASE_SERVICE_ROLE_KEY in .env.local (server only). See the README.
        </p>
      ) : null}

      <section aria-labelledby="people-title" className="rounded-card bg-surface p-5">
        <h2 id="people-title" className="text-[16px] leading-6 font-medium">
          People ({people.length})
        </h2>
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {people.map((person) => (
            <li key={person.id} className="py-3">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] leading-5 font-medium">{person.displayName}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{emails.get(person.id) ?? "email hidden"}</span>
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <Pill tone="neutral">{person.role === "owner" ? "Owner" : "Staff"}</Pill>
                    {person.isActive ? <Pill tone="positive">Active</Pill> : <Pill tone="negative">Disabled</Pill>}
                    {person.mustChangePassword ? <Pill tone="warning">Must set password</Pill> : null}
                  </span>
                </summary>
                <div className="pt-4">
                  {person.role === "owner" ? (
                    <p className="max-w-[60ch] text-[14px] text-muted-foreground">
                      Owners have full access and are managed in the database, not here, so nobody can lock the business out by accident.
                    </p>
                  ) : (
                    <EditStaffForm
                      userId={person.id}
                      displayName={person.displayName}
                      isActive={person.isActive}
                      permissions={person.permissions}
                    />
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="add-title" className="rounded-card bg-surface p-5">
        <h2 id="add-title" className="text-[16px] leading-6 font-medium">
          Add a staff member
        </h2>
        <div className="mt-3">
          <CreateStaffForm disabled={!adminReady} />
        </div>
      </section>
    </div>
  );
}

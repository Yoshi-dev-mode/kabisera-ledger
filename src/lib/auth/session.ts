import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, canAny, isOwner, parseProfileRow, type Permission, type Profile } from "@/lib/auth/permissions";

export type Session = { userId: string; email: string | null; profile: Profile | null };
export type ActiveSession = { userId: string; email: string | null; profile: Profile };

/**
 * Who is signed in, verified with the auth server (not just read from a cookie), plus their profile row.
 * Cached per request so layouts and pages can both call it without repeating the work.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: row } = await supabase
    .from("profiles")
    .select("id, display_name, role, is_active, permissions, must_change_password")
    .eq("id", data.user.id)
    .maybeSingle();
  return { userId: data.user.id, email: data.user.email ?? null, profile: parseProfileRow(row) };
});

/**
 * For pages and layouts: returns an active, ready-to-work session, or redirects.
 *  - not signed in            -> /login
 *  - no profile or deactivated -> /auth/blocked (signs them out)
 *  - must choose a password    -> /change-password
 */
export async function requireSession(options: { allowMustChangePassword?: boolean } = {}): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.profile || !session.profile.isActive) redirect("/auth/blocked");
  if (session.profile.mustChangePassword && !options.allowMustChangePassword) redirect("/change-password");
  return { userId: session.userId, email: session.email, profile: session.profile };
}

export async function requirePermission(permission: Permission): Promise<ActiveSession> {
  const session = await requireSession();
  if (!can(session.profile, permission)) redirect("/forbidden");
  return session;
}

export async function requireOwner(): Promise<ActiveSession> {
  const session = await requireSession();
  if (!isOwner(session.profile)) redirect("/forbidden");
  return session;
}

/** For server actions: never redirects; returns null when the person may not act. */
export async function getActionSession(): Promise<ActiveSession | null> {
  const session = await getSession();
  if (!session?.profile || !session.profile.isActive || session.profile.mustChangePassword) return null;
  return { userId: session.userId, email: session.email, profile: session.profile };
}

export async function getOwnerActionSession(): Promise<ActiveSession | null> {
  const session = await getActionSession();
  return session && isOwner(session.profile) ? session : null;
}

/** Passes if the person holds at least one of the permissions. */
export async function requireAnyPermission(permissions: readonly Permission[]): Promise<ActiveSession> {
  const session = await requireSession();
  if (!canAny(session.profile, permissions)) redirect("/forbidden");
  return session;
}

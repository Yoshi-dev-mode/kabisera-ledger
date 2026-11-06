import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getServiceRoleKey } from "@/lib/env.server";

/**
 * Admin client (service role). Used ONLY to create, ban or unban sign-in accounts for staff, after the caller
 * has been verified as an owner. It must never be used to read or write business data.
 */
export function createAdminClient() {
  const env = getPublicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

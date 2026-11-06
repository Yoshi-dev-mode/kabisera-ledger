import "server-only";
import { EnvError, parseServerEnv } from "@/lib/env";

/** The service-role key bypasses row-level security. It is read only here, only on the server. */
export function getServiceRoleKey(): string {
  const env = parseServerEnv({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
  });
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new EnvError(["SUPABASE_SERVICE_ROLE_KEY"]);
  }
  return env.SUPABASE_SERVICE_ROLE_KEY;
}

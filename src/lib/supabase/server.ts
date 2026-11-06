import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";
import { hardenCookieOptions } from "@/lib/supabase/cookies";

/**
 * Server Supabase client bound to the signed-in person's session cookies, so database
 * row-level security and permission checks run as that person. Never uses the service-role key.
 * Session cookies it writes are always httpOnly, SameSite=Lax and (in production) Secure.
 */
export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, hardenCookieOptions(options, isProduction));
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}

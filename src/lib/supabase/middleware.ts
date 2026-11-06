import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hardenCookieOptions } from "@/lib/supabase/cookies";

/**
 * Refreshes the Supabase session on every request and tells the caller who is signed in.
 * Uses auth.getUser(), which asks the auth server to validate the token, never getSession(), which
 * would trust whatever is in the cookie.
 */
export async function updateSession(request: NextRequest, applyHeaders: (headers: Headers) => void) {
  const isProduction = process.env.NODE_ENV === "production";

  const makeResponse = () => {
    const headers = new Headers(request.headers);
    applyHeaders(headers);
    return NextResponse.next({ request: { headers } });
  };
  let response = makeResponse();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { response, user: null as { id: string } | null, configured: false };
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = makeResponse();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, hardenCookieOptions(options, isProduction));
        }
      },
    },
  });

  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ? { id: data.user.id } : null;
  } catch {
    user = null; // auth server unreachable: treat as signed out
  }
  return { response, user, configured: true };
}

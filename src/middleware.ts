import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Runs before every page. It (1) refreshes the sign-in session, (2) sends signed-out visitors to /login,
 * and (3) attaches a Content-Security-Policy in REPORT-ONLY mode (violations show in the browser console but
 * nothing is blocked yet). This is a first line of defence only: every page and action ALSO checks the
 * person's role itself, and the database enforces access again with row-level security.
 */
const PUBLIC_PATHS = ["/login", "/auth/blocked", "/api/health"];
const CSP_HEADER = "Content-Security-Policy-Report-Only";

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function buildCsp(nonce: string, isDevelopment: boolean): string {
  const scripts = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDevelopment) scripts.push("'unsafe-eval'"); // Next.js hot reload needs it in development only
  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function redirectKeepingCookies(from: NextResponse, to: URL, csp: string): NextResponse {
  const redirect = NextResponse.redirect(to);
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  redirect.headers.set(CSP_HEADER, csp);
  return redirect;
}

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");

  const { response, user, configured } = await updateSession(request, (headers) => {
    headers.set("x-nonce", nonce);
    headers.set(CSP_HEADER, csp);
  });
  response.headers.set(CSP_HEADER, csp);

  const { pathname, search } = request.nextUrl;

  if (!configured) {
    if (isPublic(pathname)) return response;
    return new NextResponse(
      "Kabisera Ledger is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
      { status: 503 },
    );
  }

  if (!user && !isPublic(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    if (pathname !== "/") target.searchParams.set("next", `${pathname}${search}`);
    return redirectKeepingCookies(response, target, csp);
  }

  if (user && pathname === "/login") {
    const target = request.nextUrl.clone();
    target.pathname = "/dashboard";
    target.search = "";
    return redirectKeepingCookies(response, target, csp);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

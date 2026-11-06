import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Setup check. Reports only whether configuration is PRESENT (true/false).
 * It never returns values, and it does not touch the database: every table is
 * deny-by-default until Phase 2 adds authentication and policies.
 */
export function GET() {
  const configured = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
  return NextResponse.json(
    { status: "ok", app: "kabisera-ledger", phase: 1, configured },
    { headers: { "Cache-Control": "no-store" } },
  );
}

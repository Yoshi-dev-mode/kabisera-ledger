import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * People land here when they have a valid sign-in but no active profile (never set up, or deactivated).
 * We sign them out and explain on the sign-in page, so they never loop between pages.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const target = new URL("/login", request.url);
  target.searchParams.set("reason", "no-access");
  return NextResponse.redirect(target);
}

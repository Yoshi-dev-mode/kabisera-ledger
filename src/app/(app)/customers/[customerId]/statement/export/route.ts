import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/permissions";
import { getActionSession } from "@/lib/auth/session";
import { fetchCustomer, fetchDebtEvents } from "@/lib/data/queries";
import { fileSlug, statementCsv } from "@/lib/exports";
import { buildStatement } from "@/lib/statement";
import { isBusinessDateString, todayBusinessDate } from "@/lib/time";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  if (!isUuid(customerId)) return new NextResponse("Not found", { status: 404 });
  const session = await getActionSession();
  if (!session || !can(session.profile, "customers.view")) return new NextResponse("Forbidden", { status: 403 });

  const today = todayBusinessDate();
  const rawFrom = request.nextUrl.searchParams.get("from") ?? "";
  const rawTo = request.nextUrl.searchParams.get("to") ?? "";
  let from = isBusinessDateString(rawFrom) ? rawFrom : `${today.slice(0, 8)}01`;
  let to = isBusinessDateString(rawTo) ? rawTo : today;
  if (from > to) [from, to] = [to, from];

  const customer = await fetchCustomer(customerId);
  if (!customer) return new NextResponse("Not found", { status: 404 });
  const statement = buildStatement(await fetchDebtEvents(customerId), from, to);
  const csv = statementCsv(customer.displayName, statement, new Date());
  const name = `kabisera-${fileSlug(customer.displayName)}-statement-${from.replaceAll("-", "")}-${to.replaceAll("-", "")}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

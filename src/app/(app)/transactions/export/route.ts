import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/permissions";
import { getActionSession } from "@/lib/auth/session";
import { fetchTransactions } from "@/lib/data/queries";
import { transactionsCsv } from "@/lib/exports";
import { parseHistoryFilters, searchParamsToObject } from "@/lib/filters";
import { todayBusinessDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getActionSession();
  if (!session || !(can(session.profile, "reports.view") || can(session.profile, "customers.view"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const filters = parseHistoryFilters(searchParamsToObject(request.nextUrl.searchParams));
  const { rows } = await fetchTransactions(filters, { all: true });
  const csv = transactionsCsv(rows, new Date());
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kabisera-transactions-${todayBusinessDate().replaceAll("-", "")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

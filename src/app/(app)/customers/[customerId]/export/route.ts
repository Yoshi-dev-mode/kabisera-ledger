import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/permissions";
import { getActionSession } from "@/lib/auth/session";
import { fetchCustomer, fetchTransactions } from "@/lib/data/queries";
import { fileSlug, transactionsCsv } from "@/lib/exports";
import { parseHistoryFilters, searchParamsToObject } from "@/lib/filters";
import { todayBusinessDate } from "@/lib/time";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  if (!isUuid(customerId)) return new NextResponse("Not found", { status: 404 });
  const session = await getActionSession();
  if (!session || !can(session.profile, "customers.view")) return new NextResponse("Forbidden", { status: 403 });

  const customer = await fetchCustomer(customerId);
  if (!customer) return new NextResponse("Not found", { status: 404 });
  const filters = parseHistoryFilters(searchParamsToObject(request.nextUrl.searchParams));
  const { rows } = await fetchTransactions(filters, { customerId, all: true });
  const csv = transactionsCsv(rows, new Date());
  const name = `kabisera-${fileSlug(customer.displayName)}-history-${todayBusinessDate().replaceAll("-", "")}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/permissions";
import { getActionSession } from "@/lib/auth/session";
import { groupSeries, parseReportRange } from "@/lib/closing";
import { fetchDailySeries, fetchDiscrepancyReport, fetchFloatReport, fetchPeriodReport, fetchStaffReport } from "@/lib/data/queries";
import { discrepanciesCsv, floatCsv, periodCsv, seriesCsv, staffCsv } from "@/lib/exports";
import { searchParamsToObject } from "@/lib/filters";
import { todayBusinessDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getActionSession();
  if (!session || !can(session.profile, "reports.view")) return new NextResponse("Forbidden", { status: 403 });
  const params = request.nextUrl.searchParams;
  const { from, to, grain } = parseReportRange(searchParamsToObject(params), todayBusinessDate());
  const report = params.get("report") ?? "";
  const now = new Date();

  let csv: string;
  switch (report) {
    case "summary": csv = periodCsv(await fetchPeriodReport(from, to), from, to, now); break;
    case "activity": csv = seriesCsv(groupSeries(await fetchDailySeries(from, to), grain), now); break;
    case "float": csv = floatCsv(await fetchFloatReport(from, to), from, to, now); break;
    case "staff": csv = staffCsv(await fetchStaffReport(from, to), now); break;
    case "discrepancies": csv = discrepanciesCsv(await fetchDiscrepancyReport(from, to), now); break;
    default: return new NextResponse("Unknown report", { status: 400 });
  }
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kabisera-${report}-${from.replaceAll("-", "")}-${to.replaceAll("-", "")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

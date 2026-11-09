"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactPesos, type ChartPoint } from "@/lib/dashboard";
import { formatPesos } from "@/lib/money";

/**
 * Net profit per day. Built to the chart rules in the design direction: one hue for the data, a few light
 * horizontal gridlines, no y-axis line, square bars, no animation or markers. A text table below carries the same
 * numbers for screen readers.
 */
export function ProfitChart({ points }: { points: ChartPoint[] }) {
  const empty = points.every((p) => p.profitCents === 0);
  return (
    <div>
      <div role="img" aria-label="Bar chart of net profit for each of the last days. The same figures are in the table that follows." className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e6e6e6" strokeDasharray="0" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#d4d4d4" }} tick={{ fontSize: 12, fill: "#6b6b6b" }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={60} tickCount={4} tick={{ fontSize: 12, fill: "#6b6b6b" }} tickFormatter={(v: number) => compactPesos(v)} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              contentStyle={{ borderRadius: 6, border: "1px solid #e6e6e6", boxShadow: "none", fontSize: 13 }}
              labelStyle={{ color: "#0a0a0a" }}
              formatter={(value) => [formatPesos(Math.round(Number(value)), { signed: true }), "Net profit"]}
            />
            <Bar dataKey="profitCents" fill="var(--chart-3)" radius={0} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {empty ? <p className="mt-2 text-[13px] text-muted-foreground">No profit has been recorded in this period yet.</p> : null}
      <table className="sr-only">
        <caption>Net profit by day</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Fees and load margin</th><th scope="col">Tip income</th><th scope="col">Costs</th><th scope="col">Net profit</th></tr></thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}><th scope="row">{p.label}</th><td>{formatPesos(p.feesCents)}</td><td>{formatPesos(p.tipIncomeCents)}</td><td>{formatPesos(p.costsCents)}</td><td>{formatPesos(p.profitCents, { signed: true })}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

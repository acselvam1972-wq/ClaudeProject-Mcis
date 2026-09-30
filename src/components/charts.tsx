"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axisTick = { fill: "var(--muted)", fontSize: 11 };
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 6, fontSize: 12, color: "var(--ink)" },
  labelStyle: { color: "var(--ink)", fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: "var(--ink-2)", padding: 0 },
};
const legendStyle = { fontSize: 12, color: "var(--ink-2)" };

const shortDate = (d: string) => {
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
};

export function SCurveChart({ data, today }: { data: { date: string; planned?: number; actual?: number }[]; today: string }) {
  if (data.length === 0) return <p className="py-16 text-center text-sm text-muted">No baseline or progress recorded yet.</p>;
  // True time axis so weekly baseline points and daily actuals are spaced correctly.
  const rows = data.map((d) => ({ ...d, t: Date.parse(`${d.date}T00:00:00Z`) }));
  const todayT = Date.parse(`${today}T00:00:00Z`);
  const fmtT = (t: number) => shortDate(new Date(t).toISOString().slice(0, 10));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtT} tick={axisTick} axisLine={{ stroke: "var(--axis)" }} tickLine={false} minTickGap={40} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={axisTick} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(l) => fmtT(Number(l))}
            formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name]}
            cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
          />
          <Legend wrapperStyle={legendStyle} iconType="plainline" />
          <ReferenceLine x={todayT} stroke="var(--line-strong)" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }} />
          <Line type="monotone" dataKey="planned" name="Planned (baseline)" stroke="var(--series-1)" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} connectNulls isAnimationActive={false} />
          <Area type="monotone" dataKey="actual" name="Actual" stroke="var(--series-2)" strokeWidth={2} fill="var(--series-2)" fillOpacity={0.08} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StageChart({ data }: { data: { code: string; name: string; donePct: number; pendingPct: number }[] }) {
  return (
    <div className="w-full" style={{ height: Math.max(180, data.length * 34 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }} barCategoryGap={6}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="code" tick={{ ...axisTick, fill: "var(--ink-2)" }} axisLine={false} tickLine={false} width={72} />
          <Tooltip
            {...tooltipStyle}
            cursor={{ fill: "var(--surface-2)" }}
            labelFormatter={(l, p) => (p?.[0]?.payload?.name as string) ?? String(l)}
            formatter={(v, name) => [`${Number(v).toFixed(1)}% of tonnage`, name]}
          />
          <Legend wrapperStyle={legendStyle} />
          <Bar isAnimationActive={false} dataKey="donePct" name="Completed (approved)" stackId="s" fill="var(--series-1)" />
          <Bar isAnimationActive={false} dataKey="pendingPct" name="Awaiting QC" stackId="s" fill="var(--series-1-soft)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyChart({ data }: { data: { date: string; earnedT: number; erectedT: number }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={axisTick} axisLine={{ stroke: "var(--axis)" }} tickLine={false} minTickGap={24} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}t`} width={44} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--surface-2)" }} labelFormatter={(l) => shortDate(String(l))} formatter={(v, name) => [`${Number(v).toFixed(2)} t`, name]} />
          <Legend wrapperStyle={legendStyle} />
          <Bar isAnimationActive={false} dataKey="erectedT" name="Erected tonnage" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="earnedT" name="Earned (weighted) tonnage" fill="var(--series-3)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

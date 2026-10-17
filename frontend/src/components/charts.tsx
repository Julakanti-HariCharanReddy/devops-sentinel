import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Severity } from "../types";

const PALETTE = ["#22D3EE", "#A78BFA", "#34D399", "#F59E0B", "#F472B6", "#60A5FA"];
export const seriesColor = (i: number) => PALETTE[i % PALETTE.length];

const SEV_COLORS: Record<Severity, string> = { critical: "#EF4444", high: "#F97316", medium: "#F59E0B", low: "#64748B" };

const axis = { stroke: "#334155", tick: { fill: "#64748B", fontSize: 11 }, tickLine: false, axisLine: false };
const tooltip = {
  contentStyle: { background: "#0D1422", border: "1px solid #1C2638", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#94A3B8" },
  cursor: { stroke: "#334155" },
};

/** Response latency per monitored target, from real health checks. Null points are failed checks. */
export function LatencyChart({ history, series }: {
  history: Record<string, number | string | null>[]; series: { id: string; name: string }[];
}) {
  const names = Object.fromEntries(series.map((s) => [s.id, s.name]));
  const data = history.map((h) => ({
    ...h, t: new Date(String(h.ts)).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#1C2638" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="t" {...axis} minTickGap={32} />
        <YAxis {...axis} unit="ms" />
        <Tooltip {...tooltip} formatter={(v, k) => [v == null ? "failed" : `${Number(v).toFixed(0)} ms`, names[String(k)] ?? k]} />
        <Legend formatter={(k: string) => <span className="text-xs text-slate-400">{names[k] ?? k}</span>} iconType="circle" iconSize={7} />
        {series.map((s, i) => (
          <Line key={s.id} type="monotone" dataKey={s.id} stroke={seriesColor(i)} strokeWidth={1.75}
            dot={data.length < 3} connectNulls={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function IncidentTrendChart({ trend }: { trend: { day: string; severity: Severity; n: number }[] }) {
  const days: Record<string, any>[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ day: d, label: new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }), critical: 0, high: 0, medium: 0, low: 0 });
  }
  for (const t of trend) {
    const row = days.find((d) => d.day === t.day);
    if (row) row[t.severity] += t.n;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={days} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid stroke="#1C2638" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axis} minTickGap={16} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltip} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        {(["critical", "high", "medium", "low"] as Severity[]).map((s, i) => (
          <Bar key={s} dataKey={s} stackId="a" fill={SEV_COLORS[s]} radius={i === 3 ? [3, 3, 0, 0] : 0} maxBarSize={22} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

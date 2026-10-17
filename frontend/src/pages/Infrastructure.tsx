import { useEffect, useState } from "react";
import { Activity, Globe, RefreshCw, ServerOff, Timer, TriangleAlert } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { api } from "../services/api";
import type { ServiceStatus } from "../types";
import { Card, Empty, LiveTag, PageHeader, Spinner, StatusBadge, fmtTime } from "../components/ui";
import { LatencyChart, seriesColor } from "../components/charts";

function Metric({ label, value, icon, tone = "text-slate-100" }: { label: string; value: string; icon: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-base/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</p>
      <p className={`mt-1 font-mono text-sm tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function ServiceCard({ s, color }: { s: ServiceStatus; color: string }) {
  return (
    <div className="card card-pad transition-colors hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-line" style={{ background: color + "14" }}>
            <Globe className="h-4 w-4" style={{ color }} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{s.name}</p>
            <p className="text-xs text-slate-500">HTTP health check</p>
          </div>
        </div>
        <StatusBadge s={s.status} />
      </div>
      {s.status === "pending" ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-slate-400"><Spinner className="h-4 w-4" />Waiting for first check…</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Metric label="Response time" icon={<Timer className="h-3.5 w-3.5" />} value={s.latency_ms != null ? `${s.latency_ms.toFixed(0)} ms` : "—"} />
            <Metric label="HTTP status" icon={<Activity className="h-3.5 w-3.5" />} value={s.http_status != null ? String(s.http_status) : "no response"}
              tone={s.http_status == null || s.http_status >= 500 ? "text-red-400" : "text-slate-100"} />
            <Metric label="Availability" icon={<Activity className="h-3.5 w-3.5" />} value={`${s.availability_pct ?? 0}%`}
              tone={(s.availability_pct ?? 0) < 99 ? "text-amber-300" : "text-emerald-400"} />
            <Metric label="Failed checks" icon={<TriangleAlert className="h-3.5 w-3.5" />} value={`${s.failure_rate ?? 0}%`}
              tone={(s.failure_rate ?? 0) > 0 ? "text-red-400" : "text-slate-100"} />
          </div>
          {s.error && <p className="mt-3 rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">Last error: {s.error}</p>}
        </>
      )}
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-slate-500">
        <span>{s.checks} recent check{s.checks === 1 ? "" : "s"}</span>
        <span>Checked {fmtTime(s.last_checked)}</span>
      </div>
    </div>
  );
}

export default function Infrastructure() {
  const { data, loading, error, setData, reload } = useAsync(api.services);
  const [refreshing, setRefreshing] = useState(false);

  // Pick up results from the backend's periodic poller.
  useEffect(() => {
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, [reload]);

  const refresh = async () => {
    setRefreshing(true);
    try { setData(await api.refreshServices()); } finally { setRefreshing(false); }
  };

  return (
    <>
      <PageHeader title="Infrastructure" subtitle="Live health of your monitored endpoints."
        actions={data && <><LiveTag mode={data.mode} />
          {data.mode === "live" && (
            <button className="btn-primary" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}Check now
            </button>
          )}</>} />
      {!data ? (loading ? <div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-accent" /></div> : <Empty title="Could not load services">{error}</Empty>) :
        data.mode === "unconfigured" ? (
          <div className="card">
            <Empty icon={<ServerOff className="h-7 w-7" />} title="No endpoints are being monitored">
              Ask your administrator to add endpoints to monitor.
            </Empty>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.services.map((s, i) => <ServiceCard key={s.id} s={s} color={seriesColor(i)} />)}
            </div>
            <Card title="Response time history" className="mt-5"
              actions={<span className="text-xs text-slate-500">Last {data.history.length} checks</span>}>
              {data.history.length === 0 ? <Empty title="No checks completed yet" /> : <LatencyChart history={data.history} series={data.services} />}
            </Card>
          </>
        )}
    </>
  );
}

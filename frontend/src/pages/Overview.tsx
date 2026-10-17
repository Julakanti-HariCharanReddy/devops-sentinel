import { Activity, AlertOctagon, ArrowRight, BrainCircuit, CheckCircle2, Clock, RefreshCw, Server, Siren } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Card, EngineBadge, LiveTag, Empty, PageHeader, SeverityBadge, Spinner, Stat, StatusBadge, fmtTime } from "../components/ui";
import { IncidentTrendChart, LatencyChart } from "../components/charts";

const ACTIVITY_ICON: Record<string, typeof Activity> = {
  analysis: BrainCircuit, incident_saved: Siren, status: CheckCircle2, ai_error: AlertOctagon,
};

export default function Overview() {
  const { go } = useWorkspace();
  const { data, loading, error, reload } = useAsync(api.overview);

  if (!data) {
    return loading ? <div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-accent" /></div>
      : <Empty title="Could not load overview">{error}</Empty>;
  }

  return (
    <>
      <PageHeader title="Overview" subtitle="Service health and incident activity at a glance."
        actions={<><LiveTag mode={data.monitoring_mode} /><button className="btn-ghost" onClick={reload}><RefreshCw className="h-4 w-4" />Refresh</button></>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Monitored endpoints" value={data.services_total} icon={<Server className="h-4 w-4" />} hint="Live health checks" />
        <Stat label="Up" value={data.services_total ? `${data.services_up}/${data.services_total}` : "—"} tone="text-emerald-400" icon={<CheckCircle2 className="h-4 w-4" />} hint="Latest health check" />
        <Stat label="Active incidents" value={data.active_incidents} tone={data.active_incidents ? "text-amber-300" : "text-white"} icon={<Siren className="h-4 w-4" />} hint="From incident history" />
        <Stat label="Critical incidents" value={data.critical_incidents} tone={data.critical_incidents ? "text-red-400" : "text-white"} icon={<AlertOctagon className="h-4 w-4" />} hint="Open or investigating" />
        <Stat label="Avg response time" value={data.avg_latency_ms != null ? <>{data.avg_latency_ms}<span className="ml-1 text-sm text-slate-500">ms</span></> : "—"} icon={<Clock className="h-4 w-4" />} hint="Latest health check" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Infrastructure health · response time" actions={<button onClick={() => go("infrastructure")} className="flex items-center gap-1 text-xs text-accent hover:text-cyan-300">Details <ArrowRight className="h-3 w-3" /></button>}>
          {data.history.length === 0 ? (
            <Empty icon={<Server className="h-6 w-6" />} title={data.monitoring_mode === "live" ? "Waiting for first health check" : "No endpoints configured"}>
            </Empty>
          ) : <LatencyChart history={data.history} series={data.services} />}
        </Card>
        <Card title="Incident trends · last 14 days" actions={<span className="text-xs text-slate-500">{data.total_incidents} saved incidents</span>}>
          {data.total_incidents === 0 ? (
            <Empty icon={<Siren className="h-6 w-6" />} title="No incidents saved yet">
              Analyze a log scenario and save it to populate this chart.
            </Empty>
          ) : <IncidentTrendChart trend={data.incident_trend} />}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card title="Latest AI insights" className="xl:col-span-2"
          actions={<button onClick={() => go("history")} className="flex items-center gap-1 text-xs text-accent hover:text-cyan-300">All incidents <ArrowRight className="h-3 w-3" /></button>}>
          {data.latest_insights.length === 0 ? (
            <Empty icon={<BrainCircuit className="h-6 w-6" />} title="No analyses saved yet">
              <button className="btn-primary mt-3" onClick={() => go("analysis")}>Run an incident analysis</button>
            </Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data.latest_insights.map((i) => (
                <li key={i.id}>
                  <button onClick={() => go("history", i.id)} className="flex w-full flex-col gap-1.5 py-3 text-left first:pt-0 last:pb-0 hover:opacity-90">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">{i.id}</span>
                      <SeverityBadge s={i.severity} />
                      <StatusBadge s={i.status} />
                      <EngineBadge />
                    </div>
                    <p className="text-sm font-medium text-slate-100">{i.title}</p>
                    <p className="line-clamp-1 text-xs text-slate-400">{i.root_cause_summary}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity">
          {data.activity.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : (
            <ul className="space-y-3">
              {data.activity.map((a, idx) => {
                const Icon = ACTIVITY_ICON[a.kind] ?? Activity;
                return (
                  <li key={idx} className="flex gap-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${a.kind === "ai_error" ? "text-red-400" : "text-slate-500"}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-300">{a.message}</p>
                      <p className="text-xs text-slate-500">{fmtTime(a.ts)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

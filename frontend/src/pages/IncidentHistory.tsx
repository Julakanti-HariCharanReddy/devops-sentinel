import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, History, Search, Search as SearchIcon, Siren } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import type { IncidentStatus } from "../types";
import AnalysisView from "../components/AnalysisView";
import { EngineBadge, Empty, PageHeader, SeverityBadge, Spinner, StatusBadge, fmtTime } from "../components/ui";

function Detail({ id }: { id: string }) {
  const { go } = useWorkspace();
  const { data, loading, error, setData } = useAsync(() => api.incident(id), [id]);
  const [busy, setBusy] = useState<IncidentStatus | null>(null);

  const setStatus = async (s: IncidentStatus) => {
    setBusy(s);
    try { setData(await api.setStatus(id, s)); } finally { setBusy(null); }
  };

  if (!data) return loading ? <div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-accent" /></div>
    : <Empty title="Incident not found">{error}</Empty>;

  return (
    <>
      <button onClick={() => go("history")} className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />All incidents</button>
      <div className="card card-pad mb-5 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-400">{data.id}</span>
            <StatusBadge s={data.status} />
            <EngineBadge model={data.model} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Created {fmtTime(data.created_at)} · Updated {fmtTime(data.updated_at)} · Source {data.source_name ?? "pasted logs"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["investigating", "resolved"] as IncidentStatus[]).map((s) => (
            <button key={s} className="btn-ghost capitalize" disabled={data.status === s || !!busy} onClick={() => setStatus(s)}>
              {busy === s ? <Spinner /> : s === "resolved" ? <CheckCircle2 className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              Mark {s}
            </button>
          ))}
          <button className="btn-primary" onClick={() => void api.download(data.id, "md")}><Download className="h-4 w-4" />Export .md</button>
          <button className="btn-ghost" onClick={() => void api.download(data.id, "json")}>JSON</button>
        </div>
      </div>
      <AnalysisView a={data.analysis} />
    </>
  );
}

export default function IncidentHistory() {
  const { focusIncident, go } = useWorkspace();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, loading } = useAsync(() => api.incidents({ q: debounced, severity, status }), [debounced, severity, status, focusIncident]);

  if (focusIncident) return <Detail id={focusIncident} />;

  return (
    <>
      <PageHeader title="Incident History" subtitle="Saved incident reports, stored locally in SQLite." />
      <div className="card">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className="input pl-9" placeholder="Search by ID, title, service or root cause…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
          </div>
          <select className="input sm:w-40" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All severities</option>
            {["critical", "high", "medium", "low"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select className="input sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["open", "investigating", "resolved"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>

        {loading && !data ? <div className="flex justify-center py-16"><Spinner className="h-5 w-5 text-accent" /></div>
          : !data?.length ? (
            <Empty icon={debounced || severity || status ? <SearchIcon className="h-6 w-6" /> : <History className="h-6 w-6" />}
              title={debounced || severity || status ? "No incidents match these filters" : "No incidents saved yet"}>
              {!(debounced || severity || status) && <button className="btn-primary mt-3" onClick={() => go("analysis")}><Siren className="h-4 w-4" />Analyze an incident</button>}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                  <tr className="border-b border-line">
                    {["Incident", "Title", "Severity", "Status", "Service", "Root cause", "Created"].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.map((i) => (
                    <tr key={i.id} onClick={() => go("history", i.id)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{i.id}</td>
                      <td className="max-w-[16rem] px-4 py-3">
                        <p className="truncate font-medium text-slate-100">{i.title}</p>
                      </td>
                      <td className="px-4 py-3"><SeverityBadge s={i.severity} /></td>
                      <td className="px-4 py-3"><StatusBadge s={i.status} /></td>
                      <td className="px-4 py-3 font-mono text-xs text-cyan-300/80">{i.affected_service}</td>
                      <td className="max-w-[18rem] px-4 py-3"><p className="line-clamp-2 text-xs text-slate-400">{i.root_cause_summary}</p></td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmtTime(i.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}

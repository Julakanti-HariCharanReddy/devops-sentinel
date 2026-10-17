import { useEffect, useState } from "react";
import {
  Activity, BrainCircuit, FileText, History, LayoutDashboard, Menu, Server, Settings as SettingsIcon, ShieldCheck, X,
} from "lucide-react";
import { WorkspaceProvider } from "./hooks/useWorkspace";
import { useAsync } from "./hooks/useAsync";
import { ACCESS_EVENT, accessCode, api } from "./services/api";
import AccessGate from "./components/AccessGate";
import type { Page } from "./types";
import Overview from "./pages/Overview";
import Infrastructure from "./pages/Infrastructure";
import LogAnalyzer from "./pages/LogAnalyzer";
import IncidentAnalysis from "./pages/IncidentAnalysis";
import IncidentHistory from "./pages/IncidentHistory";
import Settings from "./pages/Settings";

const NAV: { id: Page; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "infrastructure", label: "Infrastructure", icon: Server },
  { id: "logs", label: "Log Analyzer", icon: FileText },
  { id: "analysis", label: "AI Incident Analysis", icon: BrainCircuit },
  { id: "history", label: "Incident History", icon: History },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function readHash(): { page: Page; id: string | null } {
  const [p, id] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { page: (NAV.some((n) => n.id === p) ? p : "overview") as Page, id: id || null };
}

export default function App() {
  const [{ page, id }, setRoute] = useState(readHash);
  const [mobileNav, setMobileNav] = useState(false);
  const health = useAsync(api.health);
  const [needCode, setNeedCode] = useState(false);

  useEffect(() => {
    if (health.data?.access_protected && !accessCode.get()) setNeedCode(true);
  }, [health.data]);

  useEffect(() => {
    const onDenied = () => { accessCode.clear(); setNeedCode(true); };
    window.addEventListener(ACCESS_EVENT, onDenied);
    return () => window.removeEventListener(ACCESS_EVENT, onDenied);
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (p: Page, incidentId?: string) => {
    window.location.hash = `/${p}${incidentId ? "/" + incidentId : ""}`;
    setMobileNav(false);
    window.scrollTo({ top: 0 });
  };

  const aiOk = health.data?.ai.configured;

  if (needCode) return <AccessGate onUnlocked={() => { setNeedCode(false); window.location.reload(); }} />;

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/30">
          <ShieldCheck className="h-[18px] w-[18px] text-accent" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">DevOps Sentinel</div>
          <div className="text-[11px] font-medium tracking-wide text-accent">AI</div>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ id: nid, label, icon: Icon }) => {
          const active = page === nid;
          return (
            <button key={nid} onClick={() => go(nid)}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-accent/10 text-white" : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-200"}`}>
              <Icon className={`h-4 w-4 ${active ? "text-accent" : "text-slate-500 group-hover:text-slate-300"}`} />
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
      <div className="m-3 rounded-lg border border-line bg-base/50 p-3 text-xs">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${health.error ? "bg-red-500" : aiOk ? "bg-emerald-400" : "bg-amber-400"}`} />
          <span className="text-slate-300">
            {health.error ? "Backend offline" : aiOk ? "Sarvam AI configured" : health.loading ? "Checking…" : "Sarvam AI not configured"}
          </span>
        </div>
        <div className="mt-1.5 text-slate-500">Monitoring: {health.data?.monitoring_mode === "live" ? <span className="text-emerald-400">Live checks</span> : <span className="text-slate-400">Not configured</span>}</div>
      </div>
    </nav>
  );

  return (
    <WorkspaceProvider page={page} go={go} focusIncident={id}>
      <div className="flex min-h-full">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-sidebar lg:block">{sidebar}</aside>
        {mobileNav && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNav(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-sidebar">
              <button className="absolute right-3 top-5 text-slate-400" onClick={() => setMobileNav(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
              {sidebar}
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-base/85 px-4 backdrop-blur sm:px-6 lg:hidden">
            <button onClick={() => setMobileNav(true)} className="text-slate-300" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <ShieldCheck className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold text-white">DevOps Sentinel AI</span>
          </header>
          {health.error && (
            <div className="border-b border-red-500/30 bg-red-500/10 px-6 py-2 text-sm text-red-300">
              Backend unreachable. Start it with <code className="font-mono">uvicorn app.main:app --port 8000</code> in <code className="font-mono">backend/</code>.
            </div>
          )}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {page === "overview" && <Overview />}
            {page === "infrastructure" && <Infrastructure />}
            {page === "logs" && <LogAnalyzer />}
            {page === "analysis" && <IncidentAnalysis aiConfigured={!!aiOk} />}
            {page === "history" && <IncidentHistory />}
            {page === "settings" && <Settings health={health.data} reloadHealth={health.reload} />}
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}

import { useState } from "react";
import { Activity, BrainCircuit, CheckCircle2, LogOut, PlugZap, ShieldCheck, XCircle } from "lucide-react";
import { accessCode, api } from "../services/api";
import type { Health } from "../types";
import { Card, Empty, LiveTag, PageHeader, Spinner } from "../components/ui";

export default function Settings({ health }: { health: Health | null }) {
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message?: string } | null>(null);

  if (!health) return <Empty title="Can't reach the server">Try again in a moment.</Empty>;

  const runTest = async () => {
    setTesting(true);
    setTest(await api.testAi());
    setTesting(false);
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Connection status for this workspace." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-accent" aria-hidden />AI analysis</span>}>
          <div className="flex items-center gap-3">
            {health.ai.configured
              ? <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />
              : <XCircle className="h-5 w-5 text-amber-400" aria-hidden />}
            <div>
              <p className="text-sm font-medium text-white">{health.ai.provider}</p>
              <p className="text-xs text-slate-400">{health.ai.configured ? "Connected" : "Not configured"}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={runTest} disabled={testing || !health.ai.configured}>
              {testing ? <Spinner /> : <PlugZap className="h-4 w-4" aria-hidden />}Test connection
            </button>
            <span role="status" className="text-sm">
              {test && (test.ok ? <span className="text-emerald-400">Connection OK</span>
                : <span className="text-red-400">{test.message ?? "Connection failed"}</span>)}
            </span>
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-400" aria-hidden />Monitoring</span>}
          actions={<LiveTag mode={health.monitoring_mode} />}>
          {health.monitored.length === 0 ? (
            <p className="text-sm text-slate-400">No endpoints are being monitored.</p>
          ) : (
            <ul className="space-y-2.5">
              {health.monitored.map((n) => (
                <li key={n} className="flex items-center gap-2.5 text-sm text-slate-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />{n}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />Privacy &amp; safety</span>} className="lg:col-span-2">
          <ul className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            {["Passwords, tokens and keys are removed from logs before analysis",
              "Every cited log line is checked against what you submitted",
              "Suggested fixes are never run automatically"].map((t) => (
              <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />{t}</li>
            ))}
          </ul>
          {health.access_protected && (
            <button className="btn-ghost mt-5" onClick={() => { accessCode.clear(); window.location.reload(); }}>
              <LogOut className="h-4 w-4" aria-hidden />Lock this browser
            </button>
          )}
        </Card>
      </div>
    </>
  );
}

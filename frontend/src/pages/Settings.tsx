import { useState } from "react";
import { Activity, BrainCircuit, CheckCircle2, PlugZap, RefreshCw, ShieldCheck, SlidersHorizontal, XCircle } from "lucide-react";
import { api } from "../services/api";
import type { Health } from "../types";
import { Card, Empty, LiveTag, PageHeader, Spinner } from "../components/ui";

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5 border-b border-line/60 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
    <span className="text-sm text-slate-400">{k}</span>
    <span className="break-all font-mono text-xs text-slate-200 sm:text-right">{v}</span>
  </div>
);

export default function Settings({ health, reloadHealth }: { health: Health | null; reloadHealth: () => void }) {
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; model?: string; code?: string; message?: string } | null>(null);

  if (!health) return <Empty title="Backend unreachable">Start the backend to view settings.</Empty>;

  const runTest = async () => {
    setTesting(true);
    setTest(await api.testAi());
    setTesting(false);
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Connection status and configuration. Values come from backend/.env; secrets are never shown."
        actions={<button className="btn-ghost" onClick={reloadHealth}><RefreshCw className="h-4 w-4" />Reload</button>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-accent" />AI connection</span>}>
          <div className="flex items-center gap-2">
            {health.ai.configured
              ? <><CheckCircle2 className="h-5 w-5 text-emerald-400" /><span className="text-sm font-medium text-emerald-300">API key configured</span></>
              : <><XCircle className="h-5 w-5 text-amber-400" /><span className="text-sm font-medium text-amber-300">SARVAM_API_KEY not set</span></>}
          </div>
          <div className="mt-4">
            <Row k="Provider" v={health.ai.provider} />
            <Row k="Model" v={health.ai.model} />
            <Row k="Endpoint" v={health.ai.endpoint} />
            <Row k="Auth header" v={`${health.ai.auth_header}: ${health.ai.configured ? "••••••••" : "(none)"}`} />
            <Row k="Output mode" v="response_format: json_object + schema validation" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={runTest} disabled={testing}>{testing ? <Spinner /> : <PlugZap className="h-4 w-4" />}Test connection</button>
            {test && (test.ok
              ? <span className="text-sm text-emerald-400">Connected · {test.model}</span>
              : <span className="text-sm text-red-400">{test.message} <span className="font-mono text-xs text-slate-500">({test.code})</span></span>)}
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-400" />Monitoring</span>} actions={<LiveTag mode={health.monitoring_mode} />}>
          <Row k="Method" v="HTTP GET health checks" />
          <Row k="Interval" v={`${health.monitor.interval_s}s`} />
          <Row k="Degraded above" v={`${health.monitor.degraded_ms} ms`} />
          {health.monitor.targets.length === 0
            ? <Row k="Targets" v="None. Set MONITOR_TARGETS in backend/.env" />
            : health.monitor.targets.map((t) => <Row key={t.url} k={t.name} v={t.url} />)}
        </Card>

        <Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" />Safety controls</span>}>
          <ul className="space-y-2 text-sm text-slate-300">
            {["Credentials, tokens, JWTs and connection-string passwords are redacted before logs reach Sarvam AI",
              "Logs are framed as untrusted data; embedded instructions are ignored",
              "Every AI-cited evidence line is checked against the submitted logs",
              "Suggested commands are displayed only. Nothing is executed automatically",
              "Restrictive CORS: " + health.cors_origins.join(", ")].map((t) => (
              <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{t}</li>
            ))}
          </ul>
        </Card>

        <Card title={<span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-slate-400" />Application configuration</span>}>
          <Row k="Max log size" v={`${health.limits.max_log_kb} KB`} />
          <Row k="Max lines parsed" v={health.limits.max_lines} />
          <Row k="Max lines sent to AI" v={health.limits.max_ai_excerpt_lines} />
          <Row k="Upload types" v={health.limits.upload_types.join(", ")} />
          <Row k="Database" v={health.database} />
        </Card>
      </div>
    </>
  );
}

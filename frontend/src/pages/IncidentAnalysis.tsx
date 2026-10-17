import { useState } from "react";
import {
  BrainCircuit, CheckCircle2, Download, FileText, KeyRound, Save, ShieldCheck, TriangleAlert,
} from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import AnalysisView from "../components/AnalysisView";
import ScenarioPicker from "../components/ScenarioPicker";
import { Banner, EngineBadge, Empty, PageHeader, Spinner } from "../components/ui";

const PIPELINE = ["Validate & parse", "Detect anomalies", "Redact secrets", "Sarvam AI analysis", "Validate response"];

function Pipeline() {
  return (
    <div className="card card-pad">
      <div className="flex items-center gap-2 text-sm text-slate-300"><Spinner className="h-4 w-4 text-accent" />Sentinel is analyzing your logs…</div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {PIPELINE.map((s, i) => (
          <li key={s} className={`rounded-lg border px-3 py-2 text-xs ${i < 3 ? "border-emerald-500/30 text-emerald-300" : "border-accent/40 text-accent"}`}>
            <span className="mr-1 font-mono text-slate-500">{i + 1}</span>{s}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-slate-500">Sarvam AI usually responds in 10–20 seconds.</p>
    </div>
  );
}

export default function IncidentAnalysis({ aiConfigured }: { aiConfigured: boolean }) {
  const { logs, sourceName, result, running, error, run, savedId, setSavedId, go } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const save = async () => {
    if (!result) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const inc = await api.saveIncident({ engine: result.engine, model: result.model, analysis: result.analysis,
        source_name: result.source_name, stats: result.stats });
      setSavedId(inc.id);
    } catch (e) { setSaveErr((e as Error).message); } finally { setSaving(false); }
  };

  const lines = logs ? logs.split("\n").filter((l) => l.trim()).length : 0;

  return (
    <>
      <PageHeader title="AI Incident Analysis" subtitle="Root-cause analysis of log evidence by Sarvam AI. Findings are recommendations for human review." />

      <div className="mb-5">
        <p className="h-label mb-2">1 · Choose a scenario or bring your own logs</p>
        <ScenarioPicker />
      </div>

      <div className="card card-pad mb-5 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <FileText className="h-5 w-5 shrink-0 text-slate-500" />
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-200">{logs ? (sourceName ?? "Pasted logs") : "No logs loaded"}</p>
            <p className="text-xs text-slate-500">
              {logs ? `${lines} lines ready` : "Pick a scenario above or paste logs in the Log Analyzer."}
              {" · "}<button className="text-accent hover:text-cyan-300" onClick={() => go("logs")}>{logs ? "Inspect in Log Analyzer" : "Open Log Analyzer"}</button>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void run()} disabled={!logs.trim() || running || !aiConfigured}>
            {running ? <Spinner /> : <BrainCircuit className="h-4 w-4" />}Analyze with Sarvam AI
          </button>
        </div>
      </div>

      {!aiConfigured && !error && (
        <div className="mb-5">
          <Banner tone="warn" icon={<KeyRound className="h-4 w-4" />} title="Sarvam AI is not configured">
            Set <code className="font-mono text-amber-200">SARVAM_API_KEY</code> in <code className="font-mono">backend/.env</code> and restart the backend to enable analysis.
          </Banner>
        </div>
      )}

      {error && !running && (
        <div className="mb-5">
          <Banner tone="error" icon={<TriangleAlert className="h-4 w-4" />}
            title={error.code === "SARVAM_NOT_CONFIGURED" ? "Sarvam AI is not configured" : "Sarvam AI analysis failed"}
            action={<button className="btn-ghost shrink-0" onClick={() => void run()}>Retry</button>}>
            {error.message} <span className="font-mono text-xs text-slate-500">({error.code})</span>
          </Banner>
        </div>
      )}

      {running && <Pipeline />}

      {!running && !result && !error && (
        <div className="card"><Empty icon={<BrainCircuit className="h-7 w-7" />} title="No analysis yet">
          Choose a scenario and click <span className="text-accent">Analyze with Sarvam AI</span>.
        </Empty></div>
      )}

      {!running && result && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/[0.04] p-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2">
              <EngineBadge model={result.model} />
              <span className="text-xs text-slate-400">
                {`${result.excerpt_lines} redacted log lines sent · ${(result.duration_ms / 1000).toFixed(1)}s`}
              </span>
              {result.stats.redactions > 0 && (
                <span className="flex items-center gap-1 text-xs text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" />{result.stats.redactions} secret(s) redacted</span>
              )}
              {result.unverified_evidence > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-400"><TriangleAlert className="h-3.5 w-3.5" />{result.unverified_evidence} evidence line(s) not found in logs</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {savedId ? (
                <>
                  <span className="flex items-center gap-1.5 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" />Saved as {savedId}</span>
                  <button className="btn-ghost" onClick={() => void api.download(savedId, "md")}><Download className="h-4 w-4" />Export</button>
                  <button className="btn-ghost" onClick={() => go("history", savedId)}>Open</button>
                </>
              ) : (
                <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : <Save className="h-4 w-4" />}Save incident</button>
              )}
            </div>
          </div>
          {saveErr && <Banner tone="error" icon={<TriangleAlert className="h-4 w-4" />} title="Could not save incident">{saveErr}</Banner>}
          <AnalysisView a={result.analysis} />
        </div>
      )}
    </>
  );
}

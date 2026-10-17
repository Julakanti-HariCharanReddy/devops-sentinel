import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, Eraser, FileUp, Flag, ScanSearch, ShieldCheck, TriangleAlert } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { ApiError, api } from "../services/api";
import type { Level, ParseResult } from "../types";
import ScenarioPicker from "../components/ScenarioPicker";
import { Banner, Card, Empty, PageHeader, SeverityBadge, Spinner, Stat } from "../components/ui";

const LEVEL_STYLE: Record<Level, string> = {
  ERROR: "text-red-400 bg-red-500/10",
  WARN: "text-amber-300 bg-amber-500/10",
  INFO: "text-sky-300 bg-sky-500/10",
  DEBUG: "text-slate-400 bg-slate-500/10",
  UNKNOWN: "text-slate-500 bg-slate-500/5",
};

export default function LogAnalyzer() {
  const { logs, setLogs, sourceName, setSourceName, run, go } = useWorkspace();
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Level | "SUSPICIOUS" | "ALL">("ALL");
  const fileRef = useRef<HTMLInputElement>(null);

  const doParse = async (text = logs) => {
    if (!text.trim()) return;
    setParsing(true);
    setErr(null);
    try { setParsed(await api.parse(text)); } catch (e) { setErr((e as Error).message); } finally { setParsing(false); }
  };

  // Re-parse when arriving with logs already loaded (e.g. from another page).
  useEffect(() => { if (logs.trim() && !parsed) void doParse(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (!/\.(log|txt)$/i.test(f.name)) { setErr("Only .log and .txt files are supported."); return; }
    try {
      const r = await api.upload(f);
      setLogs(r.logs);
      setSourceName(r.filename);
      void doParse(r.logs);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const entries = useMemo(() => {
    if (!parsed) return [];
    if (filter === "ALL") return parsed.entries;
    if (filter === "SUSPICIOUS") return parsed.entries.filter((e) => e.suspicious);
    return parsed.entries.filter((e) => e.level === filter);
  }, [parsed, filter]);

  const analyze = () => { void run(); go("analysis"); };
  const bytes = new Blob([logs]).size;

  return (
    <>
      <PageHeader title="Log Analyzer" subtitle="Paste or upload logs, detect failures, then hand them to Sarvam AI for root-cause analysis." />

      <div className="mb-5">
        <p className="h-label mb-2">Sample logs</p>
        <ScenarioPicker onLoaded={(t) => void doParse(t)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3" title={<span className="flex items-center gap-2">Log input {sourceName && <span className="font-mono text-xs font-normal text-slate-500">· {sourceName}</span>}</span>}
          actions={<span className="text-xs text-slate-500">{(bytes / 1024).toFixed(1)} KB / 512 KB</span>}>
          <textarea
            value={logs}
            onChange={(e) => { setLogs(e.target.value); setSourceName(null); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files[0]); }}
            spellCheck={false}
            placeholder={"Paste application logs here, drop a .log/.txt file, or pick a scenario above.\n\n2026-10-17T09:14:11Z ERROR [payment-service] Database connection timeout ..."}
            className="input h-80 resize-y font-mono text-[12px] leading-relaxed"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn-ghost" onClick={() => void doParse()} disabled={!logs.trim() || parsing}>
              {parsing ? <Spinner /> : <ScanSearch className="h-4 w-4" />}Parse logs
            </button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" />Upload .log / .txt</button>
            <input ref={fileRef} type="file" accept=".log,.txt,text/plain" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            <button className="btn-ghost" onClick={() => { setLogs(""); setParsed(null); setSourceName(null); }} disabled={!logs}><Eraser className="h-4 w-4" />Clear</button>
            <button className="btn-primary sm:ml-auto" onClick={analyze} disabled={!logs.trim()}>
              <BrainCircuit className="h-4 w-4" />Analyze with Sarvam AI
            </button>
          </div>
          {err && <div className="mt-3"><Banner tone="error" icon={<TriangleAlert className="h-4 w-4" />} title="Could not process logs">{err}</Banner></div>}
        </Card>

        <div className="space-y-5 xl:col-span-2">
          {!parsed ? (
            <Card title="Summary"><Empty icon={<ScanSearch className="h-6 w-6" />} title="Nothing parsed yet">Load a scenario or paste logs, then Parse.</Empty></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Lines" value={parsed.stats.total_lines} hint={`${parsed.stats.with_timestamp} with timestamps`} />
                <Stat label="Errors" value={parsed.stats.by_level.ERROR} tone="text-red-400" hint={`${parsed.stats.by_level.WARN} warnings`} />
                <Stat label="Suspicious" value={parsed.stats.suspicious} tone="text-amber-300" hint="Matched failure or threat patterns" />
                <Stat label="Redacted" value={parsed.stats.redactions} tone="text-emerald-400" hint="Secrets removed before AI" />
              </div>
              <Card title="Detected failure patterns">
                {parsed.failures.length === 0 ? <p className="text-sm text-slate-500">No known failure signatures matched.</p> : (
                  <ul className="space-y-2.5">
                    {parsed.failures.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-200">{f.label}</p>
                          <p className="text-xs text-slate-500">{f.category} · first at L{f.first_line}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm tabular-nums text-slate-300">×{f.count}</span>
                          <SeverityBadge s={f.severity} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {parsed.stats.services.length > 0 && (
                  <p className="mt-4 border-t border-line pt-3 text-xs text-slate-500">Services seen: <span className="text-slate-300">{parsed.stats.services.join(", ")}</span></p>
                )}
                {parsed.stats.time_range[0] && (
                  <p className="mt-1 text-xs text-slate-500">Window: <span className="font-mono text-slate-400">{parsed.stats.time_range[0]} → {parsed.stats.time_range[1]}</span></p>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {parsed && (
        <Card className="mt-5" title="Parsed entries"
          actions={
            <div className="flex flex-wrap gap-1">
              {(["ALL", "ERROR", "WARN", "INFO", "DEBUG", "SUSPICIOUS"] as const).map((l) => {
                const n = l === "ALL" ? parsed.stats.total_lines : l === "SUSPICIOUS" ? parsed.stats.suspicious : parsed.stats.by_level[l];
                return (
                  <button key={l} onClick={() => setFilter(l)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${filter === l ? "bg-accent/15 text-accent" : "text-slate-400 hover:text-slate-200"}`}>
                    {l} <span className="text-slate-500">{n}</span>
                  </button>
                );
              })}
            </div>
          }>
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-line bg-base font-mono text-[12px]">
            {entries.map((e) => (
              <div key={e.line_number} className={`flex gap-3 border-b border-line/50 px-3 py-1.5 last:border-0 ${e.suspicious ? "bg-amber-500/[0.04]" : ""}`}>
                <span className="w-8 shrink-0 select-none text-right text-slate-600">{e.line_number}</span>
                <span className={`h-fit w-14 shrink-0 rounded px-1.5 text-center text-[10px] font-semibold leading-5 ${LEVEL_STYLE[e.level]}`}>{e.level}</span>
                <span className="hidden w-40 shrink-0 truncate text-slate-500 md:block">{e.timestamp ?? "—"}</span>
                <span className="hidden w-28 shrink-0 truncate text-cyan-300/80 sm:block">{e.service ?? ""}</span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-slate-300">{e.message}</span>
                {e.suspicious && <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />}
              </div>
            ))}
            {entries.length === 0 && <p className="p-4 text-slate-500">No entries for this filter.</p>}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Lines shown after server-side credential redaction.</p>
        </Card>
      )}
    </>
  );
}

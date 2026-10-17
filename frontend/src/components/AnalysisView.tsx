import {
  AlertTriangle, CheckCircle2, CircleHelp, FileSearch, Gauge, ListChecks, Server, ShieldAlert, Siren, XCircle,
} from "lucide-react";
import type { Analysis } from "../types";
import { Card, Pill, SeverityBadge } from "./ui";

const LIKELY = {
  high: "bg-red-500/10 text-red-300 ring-red-500/25",
  medium: "bg-amber-500/10 text-amber-200 ring-amber-500/25",
  low: "bg-slate-500/10 text-slate-300 ring-slate-500/25",
};
const RISK = {
  safe: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
  caution: "bg-amber-500/10 text-amber-200 ring-amber-500/25",
  destructive: "bg-red-500/10 text-red-300 ring-red-500/25",
};

export default function AnalysisView({ a }: { a: Analysis }) {
  return (
    <div className="space-y-5">
      <div className="card card-pad">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge s={a.severity} />
          {a.affected_services.map((s) => (
            <Pill key={s} className="bg-white/[0.03] text-slate-300 ring-line normal-case">
              <Server className="h-3 w-3" /> {s}
            </Pill>
          ))}
        </div>
        <h2 className="mt-3 text-lg font-semibold text-white">{a.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{a.summary}</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" />Likely root causes <span className="font-normal text-slate-500">· hypotheses</span></span>}>
          {a.root_causes.length === 0 ? <p className="text-sm text-slate-500">None identified.</p> : (
            <ol className="space-y-3">
              {a.root_causes.map((rc, i) => (
                <li key={i} className="rounded-lg border border-line bg-base/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-slate-100">{i + 1}. {rc.cause}</p>
                    <Pill className={LIKELY[rc.likelihood]}>{rc.likelihood}</Pill>
                  </div>
                  {rc.rationale && <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{rc.rationale}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-accent" />Recommended troubleshooting <span className="font-normal text-slate-500">· not executed</span></span>}>
          {a.troubleshooting_steps.length === 0 ? <p className="text-sm text-slate-500">No steps suggested.</p> : (
            <ol className="space-y-3">
              {a.troubleshooting_steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-xs text-slate-400 ring-1 ring-line">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-slate-200">{s.step}</p>
                      <Pill className={RISK[s.risk]}>{s.risk}</Pill>
                    </div>
                    {s.command && (
                      <pre className="mt-1.5 overflow-x-auto rounded-md border border-line bg-base px-2.5 py-1.5 font-mono text-[12px] text-cyan-200">{s.command}</pre>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs text-slate-500">Sentinel never runs these commands. Review each one before using it.</p>
        </Card>
      </div>

      <Card title={<span className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-accent" />Evidence from log lines</span>}>
        {a.evidence.length === 0 ? <p className="text-sm text-slate-500">No evidence cited.</p> : (
          <ul className="space-y-2">
            {a.evidence.map((e, i) => (
              <li key={i} className="rounded-lg border border-line bg-base/60">
                <div className="flex items-center gap-2 border-b border-line/70 px-3 py-1.5 text-xs">
                  <span className="font-mono text-slate-500">L{e.line_number ?? "?"}</span>
                  {e.verified ? (
                    <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Verified in submitted logs</span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-400"><XCircle className="h-3.5 w-3.5" />Not found in submitted logs, treat with caution</span>
                  )}
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[12px] text-slate-200">{e.text}</pre>
                {e.relevance && <p className="px-3 pb-2 text-xs text-slate-400">{e.relevance}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={<span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-accent" />Confidence</span>}>
          <Pill className={LIKELY[a.confidence.level]}>{a.confidence.level}</Pill>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{a.confidence.explanation || "No explanation given."}</p>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Siren className="h-4 w-4 text-red-400" />Escalation</span>}>
          <p className={`text-sm font-medium ${a.escalation.required ? "text-red-300" : "text-emerald-300"}`}>
            {a.escalation.required ? "Human escalation recommended" : "No escalation required"}
          </p>
          {a.escalation.team && <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300"><ShieldAlert className="h-3.5 w-3.5" />{a.escalation.team}</p>}
          {a.escalation.reason && <p className="mt-1.5 text-sm text-slate-400">{a.escalation.reason}</p>}
        </Card>
        <Card title={<span className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-slate-400" />Missing information</span>}>
          {a.missing_information.length === 0 ? <p className="text-sm text-slate-500">None listed.</p> : (
            <ul className="list-disc space-y-1 pl-4 text-sm text-slate-400">
              {a.missing_information.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

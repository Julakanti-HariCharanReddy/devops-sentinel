import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { Severity } from "../types";

const SEV: Record<Severity, string> = {
  critical: "bg-red-500/10 text-red-400 ring-red-500/30",
  high: "bg-orange-500/10 text-orange-400 ring-orange-500/30",
  medium: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  low: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
};

const STATUS: Record<string, string> = {
  up: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
  down: "bg-red-500/10 text-red-400 ring-red-500/30",
  pending: "bg-slate-500/10 text-slate-400 ring-slate-500/30",
  healthy: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
  degraded: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  critical: "bg-red-500/10 text-red-400 ring-red-500/30",
  open: "bg-red-500/10 text-red-400 ring-red-500/30",
  investigating: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  resolved: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
};

export function Pill({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

export const SeverityBadge = ({ s }: { s: Severity }) => <Pill className={SEV[s]}>{s}</Pill>;

export const StatusBadge = ({ s }: { s: string }) => (
  <Pill className={STATUS[s] ?? STATUS.open}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {s}
  </Pill>
);

export function EngineBadge({ model }: { model?: string | null }) {
  return <Pill className="bg-accent/10 text-accent ring-accent/30 normal-case">Sarvam AI{model ? ` · ${model}` : ""}</Pill>;
}

export function LiveTag({ mode }: { mode: "live" | "unconfigured" }) {
  return mode === "live" ? (
    <Pill className="bg-emerald-500/10 text-emerald-300 ring-emerald-500/25 normal-case">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Live checks
    </Pill>
  ) : (
    <Pill className="bg-slate-500/10 text-slate-400 ring-slate-500/25 normal-case">Monitoring not configured</Pill>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone = "text-white" }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: string;
}) {
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between">
        <span className="h-label">{label}</span>
        <span className="text-slate-500">{icon}</span>
      </div>
      <div className={`mt-3 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <Loader2 className={`animate-spin ${className}`} />
);

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 text-slate-600">{icon}</div>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Banner({ tone, icon, title, children, action }: {
  tone: "error" | "warn" | "info" | "ok"; icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode;
}) {
  const tones = {
    error: "border-red-500/30 bg-red-500/[0.06] text-red-300",
    warn: "border-amber-500/30 bg-amber-500/[0.06] text-amber-200",
    info: "border-accent/30 bg-accent/[0.05] text-cyan-200",
    ok: "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300",
  };
  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${tones[tone]}`}>
      <div className="flex flex-1 gap-3">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {children && <div className="mt-0.5 text-sm text-slate-400">{children}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

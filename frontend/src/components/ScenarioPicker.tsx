import { useState } from "react";
import { Database, KeyRound, MemoryStick } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Spinner } from "./ui";

const ICONS: Record<string, typeof Database> = {
  "database-failure": Database, "memory-exhaustion": MemoryStick, "auth-failure": KeyRound,
};

/** Loads a bundled sample log into the shared workspace. */
export default function ScenarioPicker({ onLoaded }: { onLoaded?: (logs: string) => void }) {
  const { setLogs, setSourceName, sourceName } = useWorkspace();
  const { data } = useAsync(api.scenarios);
  const [loading, setLoading] = useState<string | null>(null);

  const load = async (id: string) => {
    setLoading(id);
    try {
      const s = await api.scenario(id);
      setLogs(s.logs);
      setSourceName(s.file);
      onLoaded?.(s.logs);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {(data ?? []).map((s) => {
        const Icon = ICONS[s.id] ?? Database;
        const active = sourceName === s.file;
        return (
          <button key={s.id} onClick={() => load(s.id)}
            className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
              active ? "border-accent/50 bg-accent/[0.06]" : "border-line bg-panel hover:border-slate-600"}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${active ? "bg-accent/10 ring-accent/30" : "bg-white/[0.03] ring-line"}`}>
              {loading === s.id ? <Spinner className="h-4 w-4 text-accent" /> : <Icon className={`h-4 w-4 ${active ? "text-accent" : "text-slate-400"}`} />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-100">{s.name}</p>
              <p className="mt-0.5 text-xs leading-snug text-slate-500">{s.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

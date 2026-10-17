import { createContext, useContext, useState, type ReactNode } from "react";
import { ApiError, api } from "../services/api";
import type { AnalyzeResponse, Page } from "../types";

/** State shared across pages: the logs being investigated and the latest analysis run. */
interface Workspace {
  logs: string;
  setLogs: (v: string) => void;
  sourceName: string | null;
  setSourceName: (v: string | null) => void;
  result: AnalyzeResponse | null;
  running: boolean;
  error: ApiError | null;
  run: () => Promise<void>;
  savedId: string | null;
  setSavedId: (id: string | null) => void;
  page: Page;
  go: (p: Page, incidentId?: string) => void;
  focusIncident: string | null;
}

const Ctx = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children, page, go, focusIncident }: {
  children: ReactNode; page: Page; go: (p: Page, id?: string) => void; focusIncident: string | null;
}) {
  const [logs, setLogs] = useState("");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const run = async () => {
    if (!logs.trim()) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await api.analyze(logs, sourceName));
      setSavedId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "ERROR", String(e)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Ctx.Provider value={{ logs, setLogs, sourceName, setSourceName, result, running, error, run,
      savedId, setSavedId, page, go, focusIncident }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace outside provider");
  return v;
}

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { accessCode, api } from "../services/api";
import { Spinner } from "./ui";

/** Shown when the backend requires a shared access code. */
export default function AccessGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      await api.verifyAccess(code.trim());
      accessCode.set(code.trim());
      onUnlocked();
    } catch {
      setError("That access code was not accepted.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/30">
            <ShieldCheck className="h-[18px] w-[18px] text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">DevOps Sentinel AI</p>
            <p className="text-xs text-slate-500">This deployment is protected</p>
          </div>
        </div>
        <label className="h-label mt-6 block" htmlFor="code">Access code</label>
        <div className="relative mt-2">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input id="code" type="password" autoFocus autoComplete="current-password" className="input pl-9"
            value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter access code" />
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button className="btn-primary mt-4 w-full" disabled={!code.trim() || checking}>
          {checking && <Spinner />}Unlock
        </button>
      </form>
    </div>
  );
}

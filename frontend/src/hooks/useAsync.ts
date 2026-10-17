import { useCallback, useEffect, useRef, useState } from "react";

/** Runs an async loader on mount (and when deps change); exposes reload for manual refresh. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(loader);
  latest.current = loader;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await latest.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, reload, setData };
}

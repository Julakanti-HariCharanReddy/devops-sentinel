"""Live endpoint monitoring: real HTTP health checks of the targets in MONITOR_TARGETS.

Each check records reachability, HTTP status and response latency. Nothing is simulated; with no
targets configured the dashboard shows an empty state.
"""
from __future__ import annotations

import asyncio
import re
import time
from collections import deque
from datetime import datetime, timezone

import httpx

from .. import config
from ..schemas import ServiceStatus

_HISTORY_LEN = 60
_results: dict[str, deque] = {}
_history: deque = deque(maxlen=_HISTORY_LEN)
_lock = asyncio.Lock()


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "service"


def targets() -> list[tuple[str, str, str]]:
    """Parse MONITOR_TARGETS ("Name|https://url;Other|http://url") into (id, name, url)."""
    out = []
    for item in config.MONITOR_TARGETS.split(";"):
        name, _, url = item.partition("|")
        name, url = name.strip(), url.strip()
        if name and url.startswith(("http://", "https://")):
            out.append((_slug(name), name, url))
    return out


async def _check(client: httpx.AsyncClient, url: str) -> dict:
    started = time.perf_counter()
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        r = await client.get(url)
        latency = round((time.perf_counter() - started) * 1000, 1)
        return {"ts": ts, "ok": r.status_code < 500, "http_status": r.status_code, "latency_ms": latency,
                "error": None if r.status_code < 500 else f"HTTP {r.status_code}"}
    except httpx.TimeoutException:
        return {"ts": ts, "ok": False, "http_status": None, "latency_ms": None,
                "error": f"Timed out after {config.MONITOR_TIMEOUT_S:.0f}s"}
    except httpx.HTTPError as exc:
        return {"ts": ts, "ok": False, "http_status": None, "latency_ms": None, "error": exc.__class__.__name__}


async def check_all() -> None:
    tgts = targets()
    if not tgts:
        return
    async with _lock:
        async with httpx.AsyncClient(timeout=config.MONITOR_TIMEOUT_S, follow_redirects=True) as client:
            results = await asyncio.gather(*(_check(client, url) for _, _, url in tgts))
        point: dict = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        for (sid, _, _), res in zip(tgts, results):
            _results.setdefault(sid, deque(maxlen=_HISTORY_LEN)).append(res)
            point[sid] = res["latency_ms"]
        _history.append(point)


async def ensure_fresh() -> None:
    """Run checks if the last one is older than the interval (serverless has no background poller)."""
    if not _history:
        await check_all()
        return
    last = datetime.fromisoformat(_history[-1]["ts"])
    if (datetime.now(timezone.utc) - last).total_seconds() >= config.MONITOR_INTERVAL_S:
        await check_all()


async def run_forever() -> None:
    while True:
        try:
            await check_all()
        except Exception:  # keep the poller alive; failures surface as "down" on the next check
            pass
        await asyncio.sleep(config.MONITOR_INTERVAL_S)


def _status(last: dict) -> str:
    if not last["ok"]:
        return "down"
    return "degraded" if last["latency_ms"] >= config.MONITOR_DEGRADED_MS else "up"


def snapshot() -> tuple[list[ServiceStatus], list[dict]]:
    out = []
    for sid, name, url in targets():
        checks = list(_results.get(sid, []))
        if not checks:
            out.append(ServiceStatus(id=sid, name=name, status="pending"))
            continue
        last = checks[-1]
        ok = sum(1 for c in checks if c["ok"])
        out.append(ServiceStatus(
            id=sid, name=name, status=_status(last), latency_ms=last["latency_ms"],
            http_status=last["http_status"], error=last["error"], last_checked=last["ts"], checks=len(checks),
            availability_pct=round(ok / len(checks) * 100, 1),
            failure_rate=round((len(checks) - ok) / len(checks) * 100, 1),
        ))
    return out, list(_history)

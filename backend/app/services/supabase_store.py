"""Supabase (PostgREST) persistence. Same interface as the SQLite functions in database.py.

Uses the project's secret / service-role key, server-side only. Schema: backend/supabase/schema.sql
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from .. import config

_SUMMARY_COLS = "id,title,severity,status,created_at,updated_at,affected_service,root_cause_summary,engine"
_client: httpx.Client | None = None


class SupabaseError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(config.SUPABASE_URL and config.SUPABASE_SECRET_KEY)


def _http() -> httpx.Client:
    global _client
    if _client is None:
        key = config.SUPABASE_SECRET_KEY
        headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):  # legacy service_role JWT; new sb_secret_ keys go in apikey only
            headers["Authorization"] = f"Bearer {key}"
        _client = httpx.Client(base_url=f"{config.SUPABASE_URL}/rest/v1", headers=headers, timeout=15)
    return _client


def _req(method: str, path: str, **kw) -> httpx.Response:
    try:
        r = _http().request(method, path, **kw)
    except httpx.HTTPError as exc:
        raise SupabaseError(f"Supabase unreachable: {exc.__class__.__name__}") from exc
    if r.status_code >= 400:
        try:
            msg = r.json().get("message", r.text)
        except ValueError:
            msg = r.text
        raise SupabaseError(f"Supabase HTTP {r.status_code}: {msg[:300]}")
    return r


def _count(path: str, params: dict) -> int:
    r = _req("GET", path, params={**params, "select": "id", "limit": 1}, headers={"Prefer": "count=exact"})
    total = r.headers.get("content-range", "*/0").rsplit("/", 1)[-1]
    return int(total) if total.isdigit() else 0


def _detail(row: dict) -> dict:
    return {**row, "analysis": row.get("analysis") or {}, "stats": row.get("stats")}


def init_db() -> None:
    try:
        _req("GET", "/incidents", params={"select": "id", "limit": 1})
        _req("GET", "/activity", params={"select": "id", "limit": 1})
    except SupabaseError as exc:
        raise SupabaseError(f"{exc}. Did you apply backend/supabase/schema.sql?") from exc


def log_activity(kind: str, message: str, ref: str | None = None) -> None:
    _req("POST", "/activity", json={"kind": kind, "message": message[:300], "ref": ref},
         headers={"Prefer": "return=minimal"})


def recent_activity(limit: int = 12) -> list[dict]:
    return _req("GET", "/activity", params={"select": "ts,kind,message,ref", "order": "id.desc", "limit": limit}).json()


def create_incident(*, title: str, severity: str, affected_service: str, root_cause_summary: str,
                    engine: str, model: str | None, source_name: str | None,
                    analysis: dict, stats: dict | None) -> str:
    iid = "INC-" + uuid.uuid4().hex[:6].upper()
    _req("POST", "/incidents", headers={"Prefer": "return=minimal"}, json={
        "id": iid, "title": title, "severity": severity, "status": "open", "affected_service": affected_service,
        "root_cause_summary": root_cause_summary, "engine": engine, "model": model, "source_name": source_name,
        "analysis": analysis, "stats": stats,
    })
    return iid


def list_incidents(q: str | None, severity: str | None, status: str | None) -> list[dict]:
    params: dict = {"select": _SUMMARY_COLS, "order": "created_at.desc", "limit": 500}
    if severity:
        params["severity"] = f"eq.{severity}"
    if status:
        params["status"] = f"eq.{status}"
    # Strip PostgREST filter syntax characters so user input can't alter the query.
    term = re.sub(r"[,()*:\"\\.%]", " ", q or "").strip()
    if term:
        params["or"] = "(" + ",".join(f"{c}.ilike.*{term}*" for c in
                                      ("title", "id", "affected_service", "root_cause_summary")) + ")"
    return _req("GET", "/incidents", params=params).json()


def get_incident(iid: str) -> dict | None:
    rows = _req("GET", "/incidents", params={"select": "*", "id": f"eq.{iid}"}).json()
    return _detail(rows[0]) if rows else None


def update_status(iid: str, status: str) -> bool:
    rows = _req("PATCH", "/incidents", params={"id": f"eq.{iid}"}, headers={"Prefer": "return=representation"},
                json={"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}).json()
    return bool(rows)


def incident_counts() -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=13)).date().isoformat()
    rows = _req("GET", "/incidents", params={"select": "created_at,severity", "created_at": f"gte.{since}"}).json()
    trend: dict[tuple[str, str], int] = {}
    for r in rows:
        k = (r["created_at"][:10], r["severity"])
        trend[k] = trend.get(k, 0) + 1
    return {
        "active": _count("/incidents", {"status": "neq.resolved"}),
        "critical": _count("/incidents", {"status": "neq.resolved", "severity": "eq.critical"}),
        "total": _count("/incidents", {}),
        "trend": [{"day": d, "severity": s, "n": n} for (d, s), n in sorted(trend.items())],
        "latest": _req("GET", "/incidents", params={"select": _SUMMARY_COLS, "order": "created_at.desc",
                                                     "limit": 4}).json(),
    }

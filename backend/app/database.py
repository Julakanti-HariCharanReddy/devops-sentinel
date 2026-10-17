"""Persistence for incidents and the activity feed: Supabase when configured, otherwise local SQLite."""
from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import DB_PATH
from .models import SCHEMA


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript(SCHEMA)


def log_activity(kind: str, message: str, ref: str | None = None) -> None:
    with connect() as c:
        c.execute("INSERT INTO activity (ts, kind, message, ref) VALUES (?, ?, ?, ?)",
                  (now_iso(), kind, message[:300], ref))


def recent_activity(limit: int = 12) -> list[dict]:
    with connect() as c:
        rows = c.execute("SELECT ts, kind, message, ref FROM activity ORDER BY id DESC LIMIT ?", (limit,))
        return [dict(r) for r in rows]


def create_incident(*, title: str, severity: str, affected_service: str, root_cause_summary: str,
                    engine: str, model: str | None, source_name: str | None,
                    analysis: dict, stats: dict | None) -> str:
    iid = "INC-" + uuid.uuid4().hex[:6].upper()
    ts = now_iso()
    with connect() as c:
        c.execute(
            "INSERT INTO incidents (id, title, severity, status, created_at, updated_at, affected_service, "
            "root_cause_summary, engine, model, source_name, analysis_json, stats_json) "
            "VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (iid, title, severity, ts, ts, affected_service, root_cause_summary, engine, model, source_name,
             json.dumps(analysis), json.dumps(stats) if stats else None))
    return iid


def _row_to_dict(r: sqlite3.Row, detail: bool) -> dict:
    d = {k: r[k] for k in ("id", "title", "severity", "status", "created_at", "updated_at",
                           "affected_service", "root_cause_summary", "engine")}
    if detail:
        d.update(model=r["model"], source_name=r["source_name"], analysis=json.loads(r["analysis_json"]),
                 stats=json.loads(r["stats_json"]) if r["stats_json"] else None)
    return d


def list_incidents(q: str | None, severity: str | None, status: str | None) -> list[dict]:
    sql, args = "SELECT * FROM incidents WHERE 1=1", []
    if q:
        sql += " AND (title LIKE ? OR id LIKE ? OR affected_service LIKE ? OR root_cause_summary LIKE ?)"
        args += [f"%{q}%"] * 4
    if severity:
        sql += " AND severity = ?"
        args.append(severity)
    if status:
        sql += " AND status = ?"
        args.append(status)
    sql += " ORDER BY created_at DESC LIMIT 500"
    with connect() as c:
        return [_row_to_dict(r, False) for r in c.execute(sql, args)]


def get_incident(iid: str) -> dict | None:
    with connect() as c:
        r = c.execute("SELECT * FROM incidents WHERE id = ?", (iid,)).fetchone()
        return _row_to_dict(r, True) if r else None


def update_status(iid: str, status: str) -> bool:
    with connect() as c:
        cur = c.execute("UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?", (status, now_iso(), iid))
        return cur.rowcount > 0


def incident_counts() -> dict:
    with connect() as c:
        active = c.execute("SELECT count(*) FROM incidents WHERE status != 'resolved'").fetchone()[0]
        critical = c.execute(
            "SELECT count(*) FROM incidents WHERE status != 'resolved' AND severity = 'critical'").fetchone()[0]
        total = c.execute("SELECT count(*) FROM incidents").fetchone()[0]
        trend = [dict(r) for r in c.execute(
            "SELECT substr(created_at, 1, 10) AS day, severity, count(*) AS n FROM incidents "
            "WHERE created_at >= date('now', '-13 days') GROUP BY day, severity ORDER BY day")]
        latest = [_row_to_dict(r, False) for r in c.execute(
            "SELECT * FROM incidents ORDER BY created_at DESC LIMIT 4")]
    return {"active": active, "critical": critical, "total": total, "trend": trend, "latest": latest}


# Swap in Supabase when credentials are present; routes call these module-level names.
from .services import supabase_store as _sb  # noqa: E402

BACKEND = "supabase" if _sb.is_configured() else "sqlite"
if BACKEND == "supabase":
    init_db = _sb.init_db  # noqa: F811
    log_activity = _sb.log_activity  # noqa: F811
    recent_activity = _sb.recent_activity  # noqa: F811
    create_incident = _sb.create_incident  # noqa: F811
    list_incidents = _sb.list_incidents  # noqa: F811
    get_incident = _sb.get_incident  # noqa: F811
    update_status = _sb.update_status  # noqa: F811
    incident_counts = _sb.incident_counts  # noqa: F811

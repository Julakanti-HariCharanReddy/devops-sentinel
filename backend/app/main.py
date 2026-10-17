from __future__ import annotations

import asyncio
import hmac
import json
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from . import config, database as db
from .schemas import (AnalyzeRequest, AnalyzeResponse, IncidentCreate, IncidentDetail, IncidentSummary,
                      IncidentUpdate, LogInput, ParseResult, ServicesResponse)
from .services import incident_analyzer, monitoring, sarvam
from .services.log_parser import parse_logs

app = FastAPI(title="DevOps Sentinel AI", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type", "X-Access-Code"])


@app.middleware("http")
async def access_gate(request: Request, call_next):
    """Optional shared access code so a public deployment can't spend the Sarvam quota."""
    path = request.url.path
    if (config.ACCESS_CODE and path.startswith("/api/") and path != "/api/health"
            and request.method != "OPTIONS"):
        supplied = request.headers.get("x-access-code", "")
        if not hmac.compare_digest(supplied.encode(), config.ACCESS_CODE.encode()):
            return JSONResponse(status_code=401, content={"detail": {
                "code": "ACCESS_REQUIRED", "message": "Enter the access code to use DevOps Sentinel AI."}})
    return await call_next(request)

SCENARIOS = {
    "database-failure": ("Database Failure", "PostgreSQL connection timeouts, HTTP 500s and rising latency",
                         "database-failure.log"),
    "memory-exhaustion": ("Memory Exhaustion", "Heap growth, OOM kills and service restarts",
                          "memory-exhaustion.log"),
    "auth-failure": ("Authentication Failure", "Failed logins, invalid tokens and suspicious access",
                     "auth-failure.log"),
}


_poller: asyncio.Task | None = None


@app.on_event("startup")
async def _startup() -> None:
    global _poller
    db.init_db()
    if not config.ON_VERCEL:
        _poller = asyncio.create_task(monitoring.run_forever())


@app.on_event("shutdown")
async def _shutdown() -> None:
    if _poller:
        _poller.cancel()


def _monitoring_mode() -> str:
    return "live" if monitoring.targets() else "unconfigured"


def _check_size(text: str) -> None:
    if len(text.encode("utf-8")) > config.MAX_LOG_BYTES:
        raise HTTPException(413, f"Logs exceed the {config.MAX_LOG_BYTES // 1024} KB limit.")


# ------------------------------------------------------------------ system
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "access_protected": bool(config.ACCESS_CODE),
        "monitoring_mode": _monitoring_mode(),
        "monitor": {"targets": [{"name": n, "url": u} for _, n, u in monitoring.targets()],
                    "interval_s": config.MONITOR_INTERVAL_S, "degraded_ms": config.MONITOR_DEGRADED_MS},
        "ai": {
            "provider": "Sarvam AI",
            "configured": sarvam.is_configured(),
            "model": config.SARVAM_MODEL,
            "endpoint": f"{config.SARVAM_BASE_URL}/chat/completions",
            "auth_header": "api-subscription-key",
        },
        "limits": {"max_log_kb": config.MAX_LOG_BYTES // 1024, "max_lines": config.MAX_LOG_LINES,
                   "max_ai_excerpt_lines": config.MAX_AI_EXCERPT_LINES,
                   "upload_types": sorted(config.ALLOWED_UPLOAD_EXTENSIONS)},
        "database": ("Supabase · " + config.SUPABASE_URL.split("//")[-1]) if db.BACKEND == "supabase"
                    else f"SQLite · {Path(config.DB_PATH).name}",
        "cors_origins": config.CORS_ORIGINS,
    }


@app.post("/api/ai/test")
async def ai_test():
    try:
        result = await sarvam.ping()
    except sarvam.SarvamError as e:
        return JSONResponse(status_code=503 if e.code == "SARVAM_NOT_CONFIGURED" else 502,
                            content={"ok": False, "code": e.code, "message": e.message})
    return {"ok": True, **result}


# ------------------------------------------------------------------ monitoring (live HTTP checks)
def _services_response() -> ServicesResponse:
    svcs, history = monitoring.snapshot()
    return ServicesResponse(mode=_monitoring_mode(), interval_s=config.MONITOR_INTERVAL_S,
                            services=svcs, history=history)


@app.get("/api/services", response_model=ServicesResponse)
async def services():
    await monitoring.ensure_fresh()
    return _services_response()


@app.post("/api/services/refresh", response_model=ServicesResponse)
async def refresh_services():
    await monitoring.check_all()
    return _services_response()


@app.get("/api/overview")
async def overview():
    await monitoring.ensure_fresh()
    svcs, history = monitoring.snapshot()
    lat = [s.latency_ms for s in svcs if s.latency_ms is not None]
    counts = db.incident_counts()
    return {
        "monitoring_mode": _monitoring_mode(),
        "services_total": len(svcs),
        "services_up": sum(1 for s in svcs if s.status == "up"),
        "avg_latency_ms": round(sum(lat) / len(lat), 1) if lat else None,
        "active_incidents": counts["active"],
        "critical_incidents": counts["critical"],
        "total_incidents": counts["total"],
        "incident_trend": counts["trend"],
        "latest_insights": counts["latest"],
        "history": history,
        "services": [s.model_dump() for s in svcs],
        "activity": db.recent_activity(),
    }


# ------------------------------------------------------------------ logs
@app.get("/api/scenarios")
def list_scenarios():
    return [{"id": k, "name": v[0], "description": v[1], "file": v[2]} for k, v in SCENARIOS.items()]


@app.get("/api/scenarios/{sid}")
def get_scenario(sid: str):
    if sid not in SCENARIOS:
        raise HTTPException(404, "Unknown scenario")
    name, desc, fname = SCENARIOS[sid]
    return {"id": sid, "name": name, "description": desc, "file": fname,
            "logs": (config.SAMPLE_LOGS_DIR / fname).read_text(encoding="utf-8")}


@app.post("/api/logs/parse", response_model=ParseResult)
def parse(body: LogInput):
    _check_size(body.logs)
    return parse_logs(body.logs)


@app.post("/api/logs/upload")
async def upload(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in config.ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(415, "Only .log and .txt files are accepted.")
    data = await file.read(config.MAX_LOG_BYTES + 1)
    if len(data) > config.MAX_LOG_BYTES:
        raise HTTPException(413, f"File exceeds the {config.MAX_LOG_BYTES // 1024} KB limit.")
    if b"\x00" in data[:4096]:
        raise HTTPException(415, "File looks binary, not a text log.")
    text = data.decode("utf-8", errors="replace")
    return {"filename": Path(file.filename).name[:200], "logs": text, "bytes": len(data)}


# ------------------------------------------------------------------ incidents
@app.post("/api/incidents/analyze", response_model=AnalyzeResponse)
async def analyze(body: AnalyzeRequest):
    _check_size(body.logs)
    try:
        result = await incident_analyzer.analyze(body.logs, body.source_name)
    except sarvam.SarvamError as e:
        db.log_activity("ai_error", f"Sarvam analysis failed: {e.code}")
        raise HTTPException(503 if e.code == "SARVAM_NOT_CONFIGURED" else 502,
                            detail={"code": e.code, "message": e.message})
    db.log_activity("analysis", f"{result.engine_label}: {result.analysis.title}")
    return result


@app.post("/api/incidents", response_model=IncidentDetail)
def save_incident(body: IncidentCreate):
    a = body.analysis
    rc = a.root_causes[0].cause if a.root_causes else a.summary
    iid = db.create_incident(
        title=a.title, severity=a.severity, affected_service=(a.affected_services or ["unknown"])[0],
        root_cause_summary=rc[:500], engine=body.engine, model=body.model, source_name=body.source_name,
        analysis=a.model_dump(), stats=body.stats.model_dump() if body.stats else None)
    db.log_activity("incident_saved", f"{iid} saved: {a.title}", iid)
    return db.get_incident(iid)


@app.get("/api/incidents", response_model=list[IncidentSummary])
def incidents(q: str | None = Query(None, max_length=100),
              severity: str | None = Query(None, pattern="^(critical|high|medium|low)$"),
              status: str | None = Query(None, pattern="^(open|investigating|resolved)$")):
    return db.list_incidents(q, severity, status)


@app.get("/api/incidents/{iid}", response_model=IncidentDetail)
def incident(iid: str):
    inc = db.get_incident(iid)
    if not inc:
        raise HTTPException(404, "Incident not found")
    return inc


@app.patch("/api/incidents/{iid}", response_model=IncidentDetail)
def patch_incident(iid: str, body: IncidentUpdate):
    if not db.update_status(iid, body.status):
        raise HTTPException(404, "Incident not found")
    db.log_activity("status", f"{iid} marked {body.status}", iid)
    return db.get_incident(iid)


@app.get("/api/incidents/{iid}/export")
def export_incident(iid: str, format: str = Query("md", pattern="^(md|json)$")):
    inc = db.get_incident(iid)
    if not inc:
        raise HTTPException(404, "Incident not found")
    headers = {"Content-Disposition": f'attachment; filename="{iid}.{format}"'}
    if format == "json":
        return PlainTextResponse(json.dumps(inc, indent=2), media_type="application/json", headers=headers)
    return PlainTextResponse(_markdown_report(inc), media_type="text/markdown", headers=headers)


def _markdown_report(inc: dict) -> str:
    a = inc["analysis"]
    engine = f"Sarvam AI ({inc['model'] or config.SARVAM_MODEL})"
    out = [f"# {inc['id']}: {a['title']}", "",
           f"- **Severity:** {a['severity']}", f"- **Status:** {inc['status']}",
           f"- **Created:** {inc['created_at']}", f"- **Affected services:** {', '.join(a['affected_services']) or 'unknown'}",
           f"- **Analysis engine:** {engine}", f"- **Source:** {inc.get('source_name') or 'pasted logs'}", "",
           "> AI findings are recommendations that need human review. Root causes are hypotheses unless stated otherwise.",
           "", "## Summary", a["summary"], "", "## Likely root causes"]
    out += [f"{i}. **{rc['cause']}** (likelihood: {rc['likelihood']}) — {rc['rationale']}"
            for i, rc in enumerate(a["root_causes"], 1)] or ["_None identified_"]
    out += ["", "## Evidence"]
    out += [f"- L{ev.get('line_number') or '?'} {'(verified)' if ev.get('verified') else '(NOT found in submitted logs)'}: "
            f"`{ev['text']}` — {ev.get('relevance', '')}" for ev in a["evidence"]] or ["_None cited_"]
    out += ["", "## Recommended troubleshooting steps (not executed)"]
    for i, st in enumerate(a["troubleshooting_steps"], 1):
        out.append(f"{i}. [{st['risk']}] {st['step']}")
        if st.get("command"):
            out.append(f"   ```\n   {st['command']}\n   ```")
    out += ["", "## Missing information"] + ([f"- {m}" for m in a["missing_information"]] or ["_None listed_"])
    c, e = a["confidence"], a["escalation"]
    out += ["", "## Confidence", f"**{c['level']}** — {c['explanation']}", "",
            "## Escalation", f"{'Required' if e['required'] else 'Not required'}"
            + (f" — {e['team']}" if e.get("team") else "") + (f": {e['reason']}" if e.get("reason") else ""), ""]
    return "\n".join(out)

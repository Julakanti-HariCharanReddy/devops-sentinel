"""Incident analysis via Sarvam AI, plus validation of the AI output against the submitted logs."""
from __future__ import annotations

import re
import time

from pydantic import ValidationError

from .. import config
from ..schemas import Analysis, AnalyzeResponse, LogEntry, ParseResult
from . import sarvam
from .log_parser import parse_logs, select_excerpt

_SEV_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def _context_header(parsed: ParseResult, source_name: str | None, excerpt_count: int) -> str:
    s = parsed.stats
    det = ", ".join(f"{f.label} x{f.count}" for f in parsed.failures) or "none"
    return (
        f"Source: {source_name or 'pasted logs'}\n"
        f"Total lines: {s.total_lines}; levels: {s.by_level}; services seen: {', '.join(s.services) or 'unknown'}\n"
        f"Time range: {s.time_range[0]} -> {s.time_range[1]}\n"
        f"Pattern detector matches (hints only, verify against lines): {det}\n"
        f"Excerpt below contains {excerpt_count} selected lines prefixed with their original line numbers (L<n>)."
    )


def _format_excerpt(lines: list[LogEntry]) -> str:
    return "\n".join(f"L{e.line_number}: {e.raw}" for e in lines)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def verify_evidence(analysis: Analysis, entries: list[LogEntry]) -> int:
    """Mark each evidence item verified only if its text really appears in the submitted logs."""
    by_line = {e.line_number: _norm(e.raw) for e in entries}
    all_lines = list(by_line.items())
    unverified = 0
    for ev in analysis.evidence:
        text = _norm(re.sub(r"^L\d+:\s*", "", ev.text))
        if not text:
            ev.verified = False
        elif ev.line_number in by_line and (text in by_line[ev.line_number] or by_line[ev.line_number] in text):
            ev.verified = True
        else:
            hit = next((n for n, raw in all_lines if text in raw), None)
            if hit is not None and len(text) >= 12:
                ev.line_number, ev.verified = hit, True
            else:
                ev.verified = False
        unverified += 0 if ev.verified else 1
    return unverified


def coerce_analysis(data: dict) -> Analysis:
    """Validate LLM JSON into the Analysis schema, normalising common deviations."""
    def low(v, allowed, default):
        v = str(v or "").strip().lower()
        return v if v in allowed else default

    data = dict(data)
    data["severity"] = low(data.get("severity"), _SEV_RANK, "medium")
    data["title"] = str(data.get("title") or "Untitled incident")[:200]
    data["summary"] = str(data.get("summary") or "")[:2000]
    svcs = data.get("affected_services") or []
    data["affected_services"] = [str(s)[:80] for s in (svcs if isinstance(svcs, list) else [svcs])][:10]

    rcs = []
    for rc in data.get("root_causes") or []:
        if isinstance(rc, str):
            rc = {"cause": rc}
        if isinstance(rc, dict) and rc.get("cause"):
            rcs.append({"cause": str(rc["cause"])[:500],
                        "likelihood": low(rc.get("likelihood"), ("high", "medium", "low"), "medium"),
                        "rationale": str(rc.get("rationale") or "")[:1000]})
    data["root_causes"] = rcs[:6]

    evs = []
    for ev in data.get("evidence") or []:
        if isinstance(ev, str):
            ev = {"text": ev}
        if isinstance(ev, dict) and ev.get("text"):
            ln = ev.get("line_number")
            try:
                ln = int(str(ln).lstrip("Ll")) if ln is not None else None
            except ValueError:
                ln = None
            evs.append({"line_number": ln, "text": str(ev["text"])[:1000],
                        "relevance": str(ev.get("relevance") or "")[:500]})
    data["evidence"] = evs[:15]

    steps = []
    for st in data.get("troubleshooting_steps") or []:
        if isinstance(st, str):
            st = {"step": st}
        if isinstance(st, dict) and st.get("step"):
            cmd = st.get("command")
            steps.append({"step": str(st["step"])[:500],
                          "command": str(cmd)[:500] if cmd and str(cmd).lower() not in ("null", "none") else None,
                          "risk": low(st.get("risk"), ("safe", "caution", "destructive"), "caution")})
    data["troubleshooting_steps"] = steps[:10]
    mi = data.get("missing_information") or []
    data["missing_information"] = [str(m)[:300] for m in (mi if isinstance(mi, list) else [mi])][:8]

    conf = data.get("confidence") or {}
    if isinstance(conf, str):
        conf = {"level": conf}
    data["confidence"] = {"level": low(conf.get("level"), ("high", "medium", "low"), "medium"),
                          "explanation": str(conf.get("explanation") or "")[:1000]}
    esc = data.get("escalation") or {}
    if isinstance(esc, (bool, str)):
        esc = {"required": bool(esc)}
    data["escalation"] = {"required": bool(esc.get("required")), "team": esc.get("team") and str(esc["team"])[:120],
                          "reason": str(esc.get("reason") or "")[:500]}
    return Analysis.model_validate(data)


async def analyze(logs: str, source_name: str | None) -> AnalyzeResponse:
    started = time.perf_counter()
    parsed = parse_logs(logs)
    excerpt = select_excerpt(parsed.entries, config.MAX_AI_EXCERPT_LINES)

    data, model = await sarvam.analyze(_format_excerpt(excerpt), _context_header(parsed, source_name, len(excerpt)))
    try:
        analysis = coerce_analysis(data)
    except ValidationError as exc:
        raise sarvam.SarvamError("SARVAM_SCHEMA_MISMATCH",
                                 f"Sarvam AI response did not match the incident schema: {exc.error_count()} error(s).") from exc
    unverified = verify_evidence(analysis, parsed.entries)

    return AnalyzeResponse(
        engine="sarvam", engine_label=f"Sarvam AI ({model})", model=model, analysis=analysis, stats=parsed.stats,
        failures=parsed.failures, excerpt_lines=len(excerpt), unverified_evidence=unverified,
        duration_ms=int((time.perf_counter() - started) * 1000), source_name=source_name,
    )

"""Rule-based log parsing and failure detection."""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

from ..config import MAX_LOG_LINES
from ..schemas import FailureMatch, LogEntry, ParseResult, ParseStats
from .redaction import redact

_TS_PATTERNS = [
    re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?"),
    re.compile(r"\d{2}/[A-Z][a-z]{2}/\d{4}:\d{2}:\d{2}:\d{2}(?: [+-]\d{4})?"),  # nginx/apache
    re.compile(r"[A-Z][a-z]{2} +\d{1,2} \d{2}:\d{2}:\d{2}"),                   # syslog
]
_LEVEL = re.compile(
    r"\b(FATAL|CRITICAL|CRIT|ERROR|ERR|SEVERE|WARNING|WARN|INFO|NOTICE|DEBUG|TRACE)\b", re.I)
_LEVEL_MAP = {
    "FATAL": "ERROR", "CRITICAL": "ERROR", "CRIT": "ERROR", "ERROR": "ERROR", "ERR": "ERROR",
    "SEVERE": "ERROR", "WARNING": "WARN", "WARN": "WARN", "INFO": "INFO", "NOTICE": "INFO",
    "DEBUG": "DEBUG", "TRACE": "DEBUG",
}
_SERVICE_PATTERNS = [
    re.compile(r"(?<![\w-])service[=:]\s*\"?([A-Za-z][A-Za-z0-9_.-]*)", re.I),
    re.compile(r"\[([a-z][a-z0-9_.-]*(?:-service|-api|-gateway|-svc|-db|-worker|gateway|postgres|redis|nginx))\]", re.I),
    re.compile(r"^\S+\s+\S+\s+([a-z][a-z0-9-]*(?:-service|-api|-gateway|-svc|-worker))\b", re.I),
]
_HTTP_5XX = re.compile(r"\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+\S+\s+5\d\d\b|(?:\bstatus[=:]\s*|\bHTTP/\d\.\d\"?\s+|\" )5\d\d\b|\bHTTP 5\d\d\b|\b5\d\d (?:Internal|Bad|Service|Gateway)", re.I)


@dataclass(frozen=True)
class FailureRule:
    id: str
    label: str
    category: str
    severity: str
    pattern: re.Pattern


FAILURE_RULES = [
    FailureRule("db_timeout", "Database connection timeout", "database", "critical", re.compile(
        r"(connection|connect|query|statement)\s+(timed? ?out|timeout)|timeout\s+(acquiring|waiting for|connecting).*(connection|pool|database|postgres)|"
        r"could not connect to (server|database)|too many (clients|connections)|connection pool (exhausted|timeout)|"
        r"remaining connection slots are reserved", re.I)),
    FailureRule("http_500", "HTTP 5xx server errors", "application", "high", _HTTP_5XX),
    FailureRule("oom", "Out-of-memory", "resources", "critical", re.compile(
        r"out ?of ?memory|OutOfMemoryError|OOMKilled|oom-kill|heap (limit|out of memory)|"
        r"cannot allocate memory|memory limit exceeded|exit code 137", re.I)),
    FailureRule("service_unavailable", "Service unavailable", "availability", "high", re.compile(
        r"service unavailable|\b503\b|upstream (connect error|unavailable)|no healthy upstream|"
        r"circuit breaker (open|opened)|health ?check failed", re.I)),
    FailureRule("auth_failure", "Authentication failures", "security", "high", re.compile(
        r"auth(entication)? fail|invalid (token|credentials|password|signature)|login failed|"
        r"failed (login|password)|unauthori[sz]ed|\b401\b|token (expired|revoked|invalid)|jwt (expired|malformed)|"
        r"access denied|permission denied|\b403\b", re.I)),
    FailureRule("conn_refused", "Connection refused", "network", "high", re.compile(
        r"connection refused|ECONNREFUSED|ECONNRESET|connection reset by peer|no route to host|"
        r"dial tcp .*: connect:", re.I)),
    FailureRule("rate_limit", "API rate limiting", "capacity", "medium", re.compile(
        r"rate.?limit|too many requests|\b429\b|throttl", re.I)),
    FailureRule("restart", "Service restarts / crash loops", "availability", "high", re.compile(
        r"CrashLoopBackOff|back-off restarting|restarting (container|service|process)|process exited|"
        r"\bsegfault\b|panic:|core dumped|container (killed|restarted)", re.I)),
    FailureRule("disk", "Disk pressure", "resources", "high", re.compile(
        r"no space left on device|disk (full|pressure)|ENOSPC", re.I)),
]

_SUSPICIOUS = re.compile(
    r"ignore (all |any )?(previous|prior) instructions|brute.?force|multiple failed|"
    r"from (unknown|unrecognized|new) (ip|location|country)|privilege escalation|sql injection|"
    r"' ?or ?'1'='1|\.\./\.\./|/etc/passwd|<script|suspicious|anomal|unusual", re.I)


def _extract_ts(line: str) -> str | None:
    for p in _TS_PATTERNS:
        m = p.search(line)
        if m:
            return m.group(0)
    return None


def _extract_service(line: str) -> str | None:
    for p in _SERVICE_PATTERNS:
        m = p.search(line)
        if m:
            return m.group(1).lower()
    return None


def parse_logs(text: str, *, already_redacted: bool = False) -> ParseResult:
    redactions = 0
    if not already_redacted:
        text, redactions = redact(text)
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    truncated = len(lines) > MAX_LOG_LINES
    lines = lines[:MAX_LOG_LINES]

    entries: list[LogEntry] = []
    failures: dict[str, FailureMatch] = {}
    levels: Counter = Counter()
    services: Counter = Counter()

    for i, raw in enumerate(lines, start=1):
        if not raw.strip():
            continue
        lm = _LEVEL.search(raw)
        level = _LEVEL_MAP[lm.group(1).upper()] if lm else "UNKNOWN"
        ts = _extract_ts(raw)
        svc = _extract_service(raw)
        msg = raw
        if lm:
            msg = raw[lm.end():].lstrip(" :]-|") or raw
        matched = [r for r in FAILURE_RULES if r.pattern.search(raw)]
        # A 5xx in an access log implies an error even with no explicit level.
        if level in ("UNKNOWN", "INFO") and any(r.id in ("http_500", "oom") for r in matched):
            level = "ERROR"
        suspicious = bool(_SUSPICIOUS.search(raw))

        for r in matched:
            fm = failures.get(r.id)
            if fm:
                fm.count += 1
            else:
                failures[r.id] = FailureMatch(id=r.id, label=r.label, category=r.category,
                                              severity=r.severity, count=1, first_line=i,
                                              sample=raw.strip()[:300])
        levels[level] += 1
        if svc:
            services[svc] += 1
        entries.append(LogEntry(line_number=i, raw=raw[:2000], timestamp=ts, level=level, service=svc,
                                message=msg.strip()[:2000], suspicious=suspicious or bool(matched),
                                failure_ids=[r.id for r in matched]))

    stamps = [e.timestamp for e in entries if e.timestamp]
    stats = ParseStats(
        total_lines=len(entries),
        by_level={k: levels.get(k, 0) for k in ("ERROR", "WARN", "INFO", "DEBUG", "UNKNOWN")},
        with_timestamp=len(stamps),
        suspicious=sum(1 for e in entries if e.suspicious),
        services=[s for s, _ in services.most_common(12)],
        time_range=[stamps[0] if stamps else None, stamps[-1] if stamps else None],
        redactions=redactions,
    )
    sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    ordered = sorted(failures.values(), key=lambda f: (sev_rank[f.severity], -f.count))
    return ParseResult(stats=stats, failures=ordered, entries=entries, truncated=truncated)


def select_excerpt(entries: list[LogEntry], limit: int) -> list[LogEntry]:
    """Pick the lines worth sending to the LLM: errors, warnings, suspicious events and a little context."""
    important = {e.line_number for e in entries
                 if e.level in ("ERROR", "WARN") or e.suspicious}
    by_line = {e.line_number: e for e in entries}
    keep: set[int] = set()
    for n in sorted(important):
        keep.update(x for x in (n - 1, n, n + 1) if x in by_line)
    if not keep:
        keep = {e.line_number for e in entries}
    chosen = [by_line[n] for n in sorted(keep)]
    if len(chosen) > limit:
        # Keep the earliest signals (onset) and the latest (current state).
        head = limit // 2
        chosen = chosen[:head] + chosen[-(limit - head):]
    return chosen

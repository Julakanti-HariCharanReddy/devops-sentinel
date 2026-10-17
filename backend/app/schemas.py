from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

Level = Literal["ERROR", "WARN", "INFO", "DEBUG", "UNKNOWN"]
Severity = Literal["critical", "high", "medium", "low"]
Likelihood = Literal["high", "medium", "low"]
Engine = Literal["sarvam"]
IncidentStatus = Literal["open", "investigating", "resolved"]


# ------------------------------------------------------------------ log parsing
class LogEntry(BaseModel):
    line_number: int
    raw: str
    timestamp: str | None = None
    level: Level
    service: str | None = None
    message: str
    suspicious: bool = False
    failure_ids: list[str] = []


class FailureMatch(BaseModel):
    id: str
    label: str
    category: str
    severity: Severity
    count: int
    first_line: int
    sample: str


class ParseStats(BaseModel):
    total_lines: int
    by_level: dict[str, int]
    with_timestamp: int
    suspicious: int
    services: list[str]
    time_range: list[str | None]
    redactions: int


class ParseResult(BaseModel):
    stats: ParseStats
    failures: list[FailureMatch]
    entries: list[LogEntry]
    truncated: bool = False


class LogInput(BaseModel):
    logs: str = Field(min_length=1)
    source_name: str | None = Field(default=None, max_length=200)

    @field_validator("logs")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("logs must not be empty")
        return v


# ------------------------------------------------------------------ analysis
class RootCause(BaseModel):
    cause: str
    likelihood: Likelihood = "medium"
    rationale: str = ""


class Evidence(BaseModel):
    line_number: int | None = None
    text: str
    relevance: str = ""
    verified: bool = False  # set by the backend: does the line exist in the submitted logs?


class TroubleshootingStep(BaseModel):
    step: str
    command: str | None = None
    risk: Literal["safe", "caution", "destructive"] = "safe"


class Confidence(BaseModel):
    level: Likelihood = "medium"
    explanation: str = ""


class Escalation(BaseModel):
    required: bool = False
    team: str | None = None
    reason: str = ""


class Analysis(BaseModel):
    title: str
    summary: str
    severity: Severity
    affected_services: list[str] = []
    root_causes: list[RootCause] = []
    evidence: list[Evidence] = []
    troubleshooting_steps: list[TroubleshootingStep] = []
    missing_information: list[str] = []
    confidence: Confidence = Confidence()
    escalation: Escalation = Escalation()


class AnalyzeRequest(LogInput):
    pass


class AnalyzeResponse(BaseModel):
    engine: Engine
    engine_label: str
    model: str | None = None
    analysis: Analysis
    stats: ParseStats
    failures: list[FailureMatch]
    excerpt_lines: int
    unverified_evidence: int
    duration_ms: int
    source_name: str | None = None


# ------------------------------------------------------------------ incidents
class IncidentCreate(BaseModel):
    engine: Engine = "sarvam"
    model: str | None = None
    analysis: Analysis
    source_name: str | None = Field(default=None, max_length=200)
    stats: ParseStats | None = None


class IncidentUpdate(BaseModel):
    status: IncidentStatus


class IncidentSummary(BaseModel):
    id: str
    title: str
    severity: Severity
    status: IncidentStatus
    created_at: str
    updated_at: str
    affected_service: str
    root_cause_summary: str
    engine: Engine


class IncidentDetail(IncidentSummary):
    model: str | None
    source_name: str | None
    analysis: Analysis
    stats: ParseStats | None


# ------------------------------------------------------------------ monitoring
class ServiceStatus(BaseModel):
    id: str
    name: str
    status: Literal["up", "degraded", "down", "pending"]
    latency_ms: float | None = None
    http_status: int | None = None
    error: str | None = None
    availability_pct: float | None = None  # share of successful checks in the retained window
    failure_rate: float | None = None
    checks: int = 0
    last_checked: str | None = None


class ServicesResponse(BaseModel):
    mode: Literal["live", "unconfigured"]
    interval_s: float
    services: list[ServiceStatus]
    history: list[dict]

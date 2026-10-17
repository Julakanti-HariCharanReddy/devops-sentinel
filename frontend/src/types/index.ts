export type Severity = "critical" | "high" | "medium" | "low";
export type Level = "ERROR" | "WARN" | "INFO" | "DEBUG" | "UNKNOWN";
export type Engine = "sarvam";
export type IncidentStatus = "open" | "investigating" | "resolved";

export interface LogEntry {
  line_number: number;
  raw: string;
  timestamp: string | null;
  level: Level;
  service: string | null;
  message: string;
  suspicious: boolean;
  failure_ids: string[];
}

export interface FailureMatch {
  id: string;
  label: string;
  category: string;
  severity: Severity;
  count: number;
  first_line: number;
  sample: string;
}

export interface ParseStats {
  total_lines: number;
  by_level: Record<Level, number>;
  with_timestamp: number;
  suspicious: number;
  services: string[];
  time_range: [string | null, string | null];
  redactions: number;
}

export interface ParseResult {
  stats: ParseStats;
  failures: FailureMatch[];
  entries: LogEntry[];
  truncated: boolean;
}

export interface Analysis {
  title: string;
  summary: string;
  severity: Severity;
  affected_services: string[];
  root_causes: { cause: string; likelihood: "high" | "medium" | "low"; rationale: string }[];
  evidence: { line_number: number | null; text: string; relevance: string; verified: boolean }[];
  troubleshooting_steps: { step: string; command: string | null; risk: "safe" | "caution" | "destructive" }[];
  missing_information: string[];
  confidence: { level: "high" | "medium" | "low"; explanation: string };
  escalation: { required: boolean; team: string | null; reason: string };
}

export interface AnalyzeResponse {
  engine: Engine;
  engine_label: string;
  model: string | null;
  analysis: Analysis;
  stats: ParseStats;
  failures: FailureMatch[];
  excerpt_lines: number;
  unverified_evidence: number;
  duration_ms: number;
  source_name: string | null;
}

export interface IncidentSummary {
  id: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  created_at: string;
  updated_at: string;
  affected_service: string;
  root_cause_summary: string;
  engine: Engine;
}

export interface IncidentDetail extends IncidentSummary {
  model: string | null;
  source_name: string | null;
  analysis: Analysis;
  stats: ParseStats | null;
}

export interface ServiceStatus {
  id: string;
  name: string;
  status: "up" | "degraded" | "down" | "pending";
  latency_ms: number | null;
  http_status: number | null;
  error: string | null;
  availability_pct: number | null;
  failure_rate: number | null;
  checks: number;
  last_checked: string | null;
}

export type MonitoringMode = "live" | "unconfigured";

export interface ServicesResponse {
  mode: MonitoringMode;
  interval_s: number;
  services: ServiceStatus[];
  history: Record<string, number | string>[];
}

export interface Overview {
  monitoring_mode: MonitoringMode;
  services_total: number;
  services_up: number;
  avg_latency_ms: number | null;
  active_incidents: number;
  critical_incidents: number;
  total_incidents: number;
  incident_trend: { day: string; severity: Severity; n: number }[];
  latest_insights: IncidentSummary[];
  history: Record<string, number | string>[];
  services: ServiceStatus[];
  activity: { ts: string; kind: string; message: string; ref: string | null }[];
}

export interface Health {
  status: string;
  access_protected: boolean;
  monitoring_mode: MonitoringMode;
  monitored: string[];
  ai: { provider: string; configured: boolean };
  max_log_kb: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  file: string;
}

export type Page = "overview" | "infrastructure" | "logs" | "analysis" | "history" | "settings";

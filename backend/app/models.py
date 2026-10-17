"""SQLite table definitions."""

SCHEMA = """
CREATE TABLE IF NOT EXISTS incidents (
    id                 TEXT PRIMARY KEY,
    title              TEXT NOT NULL,
    severity           TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    status             TEXT NOT NULL CHECK (status IN ('open', 'investigating', 'resolved')),
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    affected_service   TEXT NOT NULL,
    root_cause_summary TEXT NOT NULL,
    engine             TEXT NOT NULL CHECK (engine IN ('sarvam', 'rule_based')),
    model              TEXT,
    source_name        TEXT,
    analysis_json      TEXT NOT NULL,
    stats_json         TEXT
);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents (created_at);

CREATE TABLE IF NOT EXISTS activity (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      TEXT NOT NULL,
    kind    TEXT NOT NULL,
    message TEXT NOT NULL,
    ref     TEXT
);
"""

-- DevOps Sentinel AI: Supabase schema.
-- The backend uses the secret (service-role) key, which bypasses RLS. RLS is enabled with no policies
-- so the public anon/publishable key cannot read or write these tables.

create table if not exists public.incidents (
    id                 text primary key,
    title              text not null,
    severity           text not null check (severity in ('critical', 'high', 'medium', 'low')),
    status             text not null default 'open' check (status in ('open', 'investigating', 'resolved')),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    affected_service   text not null,
    root_cause_summary text not null,
    engine             text not null check (engine in ('sarvam', 'rule_based')),
    model              text,
    source_name        text,
    analysis           jsonb not null,
    stats              jsonb
);
create index if not exists incidents_created_at_idx on public.incidents (created_at desc);
create index if not exists incidents_severity_idx on public.incidents (severity);

create table if not exists public.activity (
    id      bigint generated always as identity primary key,
    ts      timestamptz not null default now(),
    kind    text not null,
    message text not null,
    ref     text
);
create index if not exists activity_ts_idx on public.activity (ts desc);

alter table public.incidents enable row level security;
alter table public.activity enable row level security;

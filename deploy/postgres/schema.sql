-- Tare — Postgres schema.
--
-- §4 specifies ClickHouse for the flow store and Postgres for the app tables.
-- This file holds both, and §11 records why the split was collapsed: two failed
-- ClickHouse installs against a leftover SysV init script, and at our volume the
-- column store buys nothing yet.
--
-- The arithmetic behind that: a $100K floor across five bridges and seven
-- venues is roughly 1,000–2,000 arrivals a day, so ~550k rows a year. Postgres
-- is comfortable there for years. The point at which it stops being comfortable
-- is a lower floor or a second chain, and both are decisions we would make
-- deliberately rather than stumble into.
--
--   psql "$POSTGRES_URL" -f deploy/postgres/schema.sql
--
-- Idempotent. Safe to re-run after an edit.

BEGIN;

-- users.email is case-insensitive; the extension has to exist first.
CREATE EXTENSION IF NOT EXISTS citext;

-- §3.1 vs §3.2. `matched` is a protocol-level message id; `attributed` is a
-- hot-wallet heuristic; `unattributed` is an arrival we saw settle and could not
-- tie to an origin. The API exposes this so a consumer can filter to the
-- strictest figure.
DO $$ BEGIN
  CREATE TYPE confidence_t AS ENUM ('matched', 'attributed', 'unattributed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE arrival_status_t AS ENUM ('settling', 'held', 'deployed', 'reexported');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE entity_kind_t AS ENUM ('cex_hot', 'bridge_program', 'router', 'relayer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- arrivals
--
-- §3.4: a row classified `held` at 14:00 becomes `reexported` at 21:00, and
-- that is the core mechanic rather than an edge case. Here it is a plain
-- UPDATE — which is the one place this move is a simplification rather than a
-- compromise, since ReplacingMergeTree needed FINAL or argMax on every read to
-- say the same thing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arrivals (
    id                    uuid PRIMARY KEY,
    confidence            confidence_t NOT NULL,

    -- Bridge name, or the venue for an exchange withdrawal. A venue label is
    -- the port, never the firm — §1, and there is no entity_name column here or
    -- anywhere else.
    bridge                text NOT NULL,
    message_id            text NOT NULL DEFAULT '',

    origin_chain          text NOT NULL,
    origin_tx             text NOT NULL DEFAULT '',
    origin_ts             timestamptz,

    asset                 text NOT NULL,
    amount_native         numeric(38, 12) NOT NULL,

    -- Null when the asset could not be priced. Never 0: a $0 arrival
    -- understates the headline while looking like a complete figure, which is
    -- the same failure §3.1 refuses when it keeps an unmatched arrival rather
    -- than guessing an origin.
    amount_usd            numeric(18, 2),

    -- The price must be the one at settlement, not spot at read time, or every
    -- historical figure rewrites itself as the market moves and the headline
    -- stops being reproducible. price_ts is when the quote was observed —
    -- quotes are cached to stay inside a free API allowance, so one can be
    -- minutes old, and recording that makes the error checkable.
    price_usd             numeric(18, 6),
    price_source          text,
    price_ts              timestamptz,

    solana_tx             text NOT NULL,
    solana_slot           bigint NOT NULL,
    solana_ts             timestamptz NOT NULL,
    lag_ms                integer NOT NULL DEFAULT 0,

    recipient             text NOT NULL,
    recipient_first_seen  boolean NOT NULL DEFAULT false,

    status                arrival_status_t NOT NULL DEFAULT 'settling',

    -- §3.5. Time to the first *meaningful* outbound action; ATA creation, dust
    -- and fee-only transactions do not stop this clock.
    dwell_ms              bigint,
    first_use_category    text,
    first_use_program     text,
    first_use_ts          timestamptz,

    -- §3.3. Partial exits are proportional, so this is a value and not a flag.
    reexported_usd        numeric(18, 2) NOT NULL DEFAULT 0,
    reexported_ts         timestamptz,

    -- The 24h window closing makes the row immutable history.
    window_closed         boolean NOT NULL DEFAULT false,

    updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Every public surface reads a time range, so this is the one index that
-- carries the site.
CREATE INDEX IF NOT EXISTS arrivals_ts_idx ON arrivals (solana_ts DESC);

-- §8: /origin/[chain] and /route/[bridge] filter before they aggregate.
CREATE INDEX IF NOT EXISTS arrivals_origin_ts_idx ON arrivals (origin_chain, solana_ts DESC);
CREATE INDEX IF NOT EXISTS arrivals_bridge_ts_idx ON arrivals (bridge, solana_ts DESC);

-- The 24h watcher asks "which rows are still open" every pass. Partial, so the
-- index stays small — closed rows are the overwhelming majority and are never
-- the answer.
CREATE INDEX IF NOT EXISTS arrivals_open_idx ON arrivals (solana_ts)
    WHERE window_closed = false;

-- Following a recipient, and answering "has this wallet been seen before".
CREATE INDEX IF NOT EXISTS arrivals_recipient_idx ON arrivals (recipient);

-- §3.1 matching: the pending buffer lives in Redis, but a late origin deposit
-- has to find an already-settled row by the bridge's own identifier.
CREATE UNIQUE INDEX IF NOT EXISTS arrivals_message_idx ON arrivals (bridge, message_id)
    WHERE message_id <> '';

-- ---------------------------------------------------------------------------
-- daily_flows — the rollup every public page in §8 reads.
--
-- Recomputed for any date touched by a reclassification, so the write is an
-- upsert on (date, origin). held_usd is signed: it goes negative on a
-- net-outflow day, which is why the chart has a rose state at all.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_flows (
    date            date NOT NULL,
    origin          text NOT NULL,
    gross_usd       numeric(18, 2) NOT NULL DEFAULT 0,
    held_usd        numeric(18, 2) NOT NULL DEFAULT 0,
    reexported_usd  numeric(18, 2) NOT NULL DEFAULT 0,
    idle_usd        numeric(18, 2) NOT NULL DEFAULT 0,
    entry_count     integer NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (date, origin)
);

CREATE INDEX IF NOT EXISTS daily_flows_date_idx ON daily_flows (date DESC);

-- ---------------------------------------------------------------------------
-- wallets — what is verifiable about a recipient, and nothing else.
-- §1 permits exactly this much: first seen or returning, funded from which
-- venue, how much has arrived.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
    address             text PRIMARY KEY,
    first_seen_slot     bigint NOT NULL,
    first_funded_from   text NOT NULL,
    total_received_usd  numeric(18, 2) NOT NULL DEFAULT 0,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- entities — the label set §3.2 runs on, and the part of the system that
-- compounds. Every venue, relayer and router labelled today makes tomorrow's
-- numbers sharper.
--
-- `venue` is a venue. Not a firm. A vendor label that names a trading desk is
-- dropped at the ingest boundary rather than stored here — §1 does not exempt a
-- label because someone else wrote it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entities (
    address     text PRIMARY KEY,
    kind        entity_kind_t NOT NULL,
    venue       text NOT NULL,
    source      text NOT NULL DEFAULT '',
    confidence  real NOT NULL DEFAULT 1.0,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entities_venue_idx ON entities (venue);

-- ---------------------------------------------------------------------------
-- App tables (§4). Not read until P5/P6, created now so there is one schema
-- file rather than two.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id          uuid PRIMARY KEY,
    email       citext UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    plan        text NOT NULL,
    status      text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind        text NOT NULL,
    min_usd     numeric(18, 2) NOT NULL,
    origin      text,
    channel     text NOT NULL,
    target      text NOT NULL,
    enabled     boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_rules_user_idx ON alert_rules (user_id) WHERE enabled;

CREATE TABLE IF NOT EXISTS alert_deliveries (
    id           bigserial PRIMARY KEY,
    rule_id      uuid REFERENCES alert_rules (id) ON DELETE SET NULL,
    arrival_id   uuid REFERENCES arrivals (id) ON DELETE SET NULL,
    channel      text NOT NULL,
    ok           boolean NOT NULL,
    reason       text,
    delivered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_deliveries_at_idx ON alert_deliveries (delivered_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- The key itself is never stored, only its hash. §9 hands the plaintext
    -- back exactly once, at creation.
    key_hash    text NOT NULL UNIQUE,
    label       text NOT NULL DEFAULT '',
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMIT;

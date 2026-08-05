-- Tare — ClickHouse schema (§4).
--
-- Idempotent: every statement is CREATE ... IF NOT EXISTS, so re-running this
-- after a migration edit is safe and does nothing to existing data.
--
--   clickhouse-client --queries-file deploy/clickhouse/schema.sql
--
-- Two deliberate departures from §4, both marked below: partitioning, and the
-- price columns. Everything else is the spec verbatim.

CREATE DATABASE IF NOT EXISTS tare;

-- ---------------------------------------------------------------------------
-- arrivals — one row per arrival, updated in place.
--
-- §3.4 is the reason for ReplacingMergeTree: a row classified `held` at 14:00
-- becomes `reexported` at 21:00, and that is the core mechanic rather than an
-- edge case. Writers always INSERT a full row with a fresh `updated_at`; the
-- merge keeps the newest. Readers that cannot tolerate a pre-merge duplicate
-- must say FINAL or aggregate with argMax(…, updated_at).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tare.arrivals
(
    id                    UUID,

    -- §3.1 vs §3.2. `matched` is a protocol-level message id; `attributed` is
    -- a hot-wallet heuristic; `unattributed` is an arrival we saw settle and
    -- could not tie to an origin. The API exposes this so a consumer can
    -- filter to the strictest figure.
    confidence            Enum8('matched' = 1, 'attributed' = 2, 'unattributed' = 3),

    -- Bridge name, or the venue for an exchange withdrawal. A venue label is
    -- the port, never the firm — §1, and there is no entity_name column here
    -- or anywhere else.
    bridge                LowCardinality(String),
    message_id            String,

    origin_chain          LowCardinality(String),
    origin_tx             String,
    origin_ts             DateTime64(3),

    asset                 LowCardinality(String),
    amount_native         Decimal(38, 12),
    amount_usd            Decimal(18, 2),

    -- ADDITION to §4. amount_usd has to be computed from a price at the
    -- settlement timestamp, not spot at read time — otherwise every historical
    -- figure silently rewrites itself as the market moves and the headline
    -- stops being reproducible, which is the one property §1 says the whole
    -- brand rests on. Storing the price and its source means any figure can be
    -- re-derived from what it was actually computed with.
    price_usd             Decimal(18, 6),
    price_source          LowCardinality(String),

    solana_tx             String,
    solana_slot           UInt64,
    solana_ts             DateTime64(3),
    lag_ms                UInt32,

    recipient             String,
    recipient_first_seen  Bool,

    status                Enum8('settling' = 1, 'held' = 2, 'deployed' = 3, 'reexported' = 4),

    -- §3.5. Time to the first *meaningful* outbound action; ATA creation, dust
    -- and fee-only transactions do not stop this clock.
    dwell_ms              Nullable(UInt64),
    first_use_category    LowCardinality(Nullable(String)),
    first_use_program     Nullable(String),
    first_use_ts          Nullable(DateTime64(3)),

    -- §3.3. Partial exits are proportional, so this is a value and not a flag.
    reexported_usd        Decimal(18, 2) DEFAULT 0,
    reexported_ts         Nullable(DateTime64(3)),

    -- The 24h window closing makes the row immutable history.
    window_closed         Bool DEFAULT false,

    updated_at            DateTime64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
-- ADDITION to §4. §3.4 requires recomputing a day's rollup whenever an entry
-- from that day is reclassified. Monthly parts keep that read off the whole
-- table, and they let old months be dropped or frozen as one operation.
PARTITION BY toYYYYMM(solana_ts)
ORDER BY (solana_ts, id);

-- ---------------------------------------------------------------------------
-- daily_flows — the rollup every public page in §8 reads.
--
-- Recomputed for any date touched by a reclassification, so rows are replaced
-- rather than appended. `held_usd` goes negative on a net-outflow day, which
-- is why it is signed and why the chart has a rose state at all.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tare.daily_flows
(
    date            Date,
    origin          LowCardinality(String),
    gross_usd       Decimal(18, 2),
    held_usd        Decimal(18, 2),
    reexported_usd  Decimal(18, 2),
    idle_usd        Decimal(18, 2),
    entry_count     UInt32,
    updated_at      DateTime64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (date, origin);

-- ---------------------------------------------------------------------------
-- wallets — what is verifiable about a recipient, and nothing else.
--
-- first_seen or returning, funded from which venue, how much has arrived. §1
-- permits exactly this much and no more.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tare.wallets
(
    address             String,
    first_seen_slot     UInt64,
    first_funded_from   LowCardinality(String),
    total_received_usd  Decimal(18, 2),
    updated_at          DateTime64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY address;

-- ---------------------------------------------------------------------------
-- entities — the label set §3.2 runs on, and the part of the system that
-- compounds. Every venue, relayer and router labelled today makes tomorrow's
-- numbers sharper, and a competitor starting in six months starts from zero.
--
-- `venue` is a venue. Not a firm. A label bought from a vendor that names a
-- trading desk gets dropped at the ingest boundary rather than stored here —
-- §1 does not exempt a label because someone else wrote it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tare.entities
(
    address     String,
    kind        Enum8('cex_hot' = 1, 'bridge_program' = 2, 'router' = 3, 'relayer' = 4),
    venue       LowCardinality(String),
    source      String,
    confidence  Float32
)
ENGINE = ReplacingMergeTree
ORDER BY address;

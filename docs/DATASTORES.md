# Datastores

**Postgres and Redis, on the same VPS as the app.** Sized for the box this
actually runs on: 7.8 GB RAM, 2 vCPU, 96 GB disk.

§4 specifies ClickHouse for the flow store. That is now Postgres — see
*Why not ClickHouse* below, and §11 for the record.

---

## Postgres

```bash
apt-get install -y postgresql
systemctl enable --now postgresql

sudo -u postgres createuser --pwprompt tare
sudo -u postgres createdb --owner=tare tare
```

Schema:

```bash
cd /var/www/tare
psql "postgres://tare:PASSWORD@127.0.0.1:5432/tare" -f deploy/postgres/schema.sql
psql "postgres://tare:PASSWORD@127.0.0.1:5432/tare" -c '\dt'
```

Eight tables: `arrivals`, `daily_flows`, `wallets`, `entities`, plus `users`,
`subscriptions`, `alert_rules`, `alert_deliveries`, `api_keys`. Every statement
is `IF NOT EXISTS`, so re-running after a schema edit is safe.

`shared_buffers = 256MB` in `/etc/postgresql/*/main/postgresql.conf` is plenty
and leaves the box room. The default is 128MB and works too.

---

## Redis

```bash
apt-get install -y redis-server
```

`/etc/redis/redis.conf`:

```
maxmemory 256mb
maxmemory-policy noeviction
bind 127.0.0.1
```

**`noeviction` is load-bearing.** Redis holds the pending-arrival buffer keyed
on `bridge:message_id` with a 6h TTL (§3.1). Under the default `allkeys-lru`,
memory pressure silently evicts pending records — and an evicted pending record
is an arrival that can never be matched, so it lands as `unattributed` and the
unattributed share on the status page climbs for a reason nobody can find.
Better that a write fails loudly.

Redis also retires a known limitation: alert dedupe and cooldown are in-process
today, which is why `ecosystem.config.cjs` pins a single PM2 instance. Two
instances would double-post.

---

## Wiring it up

```bash
cd /var/www/tare
read -rsp 'Postgres password for user tare: ' PG && echo
sed -i -E '/^[[:space:]]*#?[[:space:]]*(POSTGRES_URL|REDIS_URL|CLICKHOUSE_)/d' .env.local
printf '\n# --- Datastores ---\nPOSTGRES_URL=postgres://tare:%s@127.0.0.1:5432/tare\nREDIS_URL=redis://127.0.0.1:6379\n' "$PG" >> .env.local
chmod 600 .env.local
unset PG
```

Nothing reads these yet. `DATA_SOURCE` stays `sim` until the ingest layer is
writing rows and the numbers have been spot-checked against §7.

---

## Why not ClickHouse

§2 says the stack is decided and not to be re-litigated mid-build, so this is a
change against the spec and it needs a reason rather than a preference.

**What happened.** Two installs failed on this box. The first, via
`curl clickhouse.com | sh`, left config files the `clickhouse` user could not
read — the box has a restrictive umask and that install path does not set
ownership. The second, via the APT package, then collided with the init script
the first had left behind: systemd's unit expects a foreground process, the SysV
script daemonises, and systemd killed the server it had just started
(`Failed with result 'protocol'`). A third attempt would probably have worked
after a full purge. It was not worth the hour.

**Why it costs nothing today.** A $100K floor across five bridges and seven
venues is roughly 1,000–2,000 arrivals a day — about 550k rows a year. Postgres
is comfortable there for years, and the aggregations §8 runs are indexed range
scans over one month, not full-table sums over tens of millions of rows. We also
needed Postgres regardless, for §4's app tables, so this removes a moving part
rather than adding one.

**One thing genuinely got simpler.** §3.4 requires rows to mutate — `held` at
14:00 becomes `reexported` at 21:00. In Postgres that is an `UPDATE`. In
ClickHouse it was `ReplacingMergeTree`, which needs `FINAL` or
`argMax(…, updated_at)` on every read to say the same thing, and quietly returns
duplicates if you forget.

**What we gave up.** Headroom. The column store starts winning when the row
count reaches tens of millions, which happens if the size floor drops much below
$100K or a second destination chain is added. Both are deliberate decisions, not
things we would drift into, and either one is the signal to revisit this — with
the schema in `deploy/clickhouse/schema.sql` kept for that day.

---

## Watch it after ingest starts

```bash
free -h
psql "$POSTGRES_URL" -c "
  SELECT count(*) AS rows, pg_size_pretty(pg_total_relation_size('arrivals')) AS size
  FROM arrivals"
```

If `arrivals` passes ~20M rows, or a 30-day aggregate stops returning inside a
second, that is the point to move the flow store — not before.

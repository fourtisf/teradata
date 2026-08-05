# Datastores

ClickHouse, Redis and Postgres on the same VPS as the app. Sized for the box
this actually runs on: **7.8 GB RAM, 2 vCPU, 96 GB disk**.

They fit. Memory is not the constraint — the two vCPUs are, once ingest,
background merges and server rendering compete for them. That becomes visible
under real volume, and when it does, ClickHouse is the piece to move off the
box. Nothing else needs to change when it does.

## Budget

| | Cap | Why |
|---|---|---|
| Next.js | ~300 MB | 68 MB observed, headroom for SSR bursts |
| ClickHouse | **3 GB, explicit** | default would take ~7 GB and OOM-kill Next.js |
| Postgres | 512 MB | accounts, subscriptions, alert rules — small |
| Redis | **256 MB, explicit** | pending-arrival buffer, §3.1 |
| Ingest workers | ~500 MB | |
| OS + reserve | ~1.5 GB | plus the 2 GB swap already configured |

The two caps in bold are the ones that must be set rather than left default.
Both defaults assume the process owns the machine.

---

## ClickHouse

```bash
mkdir -p /opt/clickhouse && cd /opt/clickhouse
curl -fsSL https://clickhouse.com/ | sh
./clickhouse install
```

The installer prompts for a `default` user password. Set one — `listen_host` is
loopback-only below, but an unauthenticated database is not something to leave
behind a single config line.

If that install path has changed, check https://clickhouse.com/docs/install
rather than guessing at a repository key.

**Apply the caps before first start:**

```bash
cp /var/www/tare/deploy/clickhouse/tare-limits.xml \
   /etc/clickhouse-server/config.d/tare-limits.xml
clickhouse start
```

**Create the schema:**

```bash
clickhouse-client --password --queries-file /var/www/tare/deploy/clickhouse/schema.sql
```

Every statement is `IF NOT EXISTS`, so re-running after a schema edit is safe.

**Verify:**

```bash
clickhouse-client --password --query "SHOW TABLES FROM tare"
# arrivals, daily_flows, entities, wallets
```

### Two departures from §4, both deliberate

**Price columns.** §4 has `amount_native` and `amount_usd` but names no price
source. Converting between them needs a price *at the settlement timestamp*.
Spot at read time means every historical figure silently rewrites itself as the
market moves — the headline stops being reproducible, which is the one property
§1 says the whole brand rests on. `arrivals` therefore carries `price_usd` and
`price_source`, so any figure can be re-derived from what it was actually
computed with.

**Monthly partitions.** §3.4 requires recomputing a day's rollup whenever an
entry from that day is reclassified. Partitioning by month keeps that read off
the whole table, and lets old months be frozen or dropped as one operation.

---

## Redis

```bash
apt install -y redis-server
```

`/etc/redis/redis.conf`:

```
maxmemory 256mb
maxmemory-policy noeviction
bind 127.0.0.1
```

**`noeviction` is load-bearing.** Redis holds the pending-arrival buffer keyed
on `bridge:message_id` with a 6h TTL (§3.1). Under the default
`allkeys-lru`, memory pressure silently evicts pending records — and an evicted
pending record is an arrival that can never be matched, so it lands as
`unattributed` and the unattributed share on the status page climbs for a
reason nobody can find. Better that a write fails loudly.

Redis also retires two known limitations once the ingest layer lands: alert
dedupe and cooldown are in-process today, which is why `ecosystem.config.cjs`
pins a single PM2 instance. Two instances would double-post.

---

## Postgres

```bash
apt install -y postgresql
sudo -u postgres createuser --pwprompt tare
sudo -u postgres createdb --owner=tare tare
```

`shared_buffers = 128MB` is plenty. This holds `users`, `subscriptions`,
`alert_rules`, `alert_deliveries` and `api_keys` — none of them large, none of
them hot.

---

## Wiring it up

```bash
cd /var/www/tare
printf '\nCLICKHOUSE_URL=http://127.0.0.1:8123\nCLICKHOUSE_USER=default\nCLICKHOUSE_PASSWORD=%s\nREDIS_URL=redis://127.0.0.1:6379\nPOSTGRES_URL=postgres://tare:%s@127.0.0.1:5432/tare\n' \
  "$CH_PASSWORD" "$PG_PASSWORD" >> .env.local
chmod 600 .env.local
```

Nothing reads these yet. `DATA_SOURCE` stays `sim` until the ingest layer is
writing rows and the numbers have been spot-checked against §7.

## Watch the memory after ingest starts

```bash
free -h
clickhouse-client --password --query "
  SELECT formatReadableSize(sum(bytes_on_disk)) AS disk, sum(rows)
  FROM system.parts WHERE database = 'tare' AND active"
```

If ClickHouse is pressing its 3 GB ceiling under normal load rather than during
a one-off backfill, that is the signal to move it off the box — not to raise
the ceiling.

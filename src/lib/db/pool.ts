/**
 * The Postgres connection, and the only place a pool is created.
 *
 * §11 records why this is Postgres rather than the ClickHouse §2 specified: at
 * a $100K floor across five bridges and seven venues the column store buys
 * nothing yet, and Postgres was already required for §4's app tables. So there
 * is one datastore, and this is the door to it.
 *
 * `POSTGRES_URL` unset throws rather than defaulting to localhost. A worker
 * that silently connects to a database nobody meant it to is how a night of
 * ingest lands somewhere it cannot be found — and on this project, the failure
 * that matters more is a *read* path quietly answering from an empty database,
 * which would put a wrong headline figure on a page. §2's rule for
 * `DATA_SOURCE=live` is the same rule: fail loudly rather than serve a number
 * that cannot be stood behind.
 */

import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool) return pool;

  const url = process.env.POSTGRES_URL?.trim();
  if (!url) {
    throw new Error(
      "POSTGRES_URL is not set. The live data path needs a database; " +
        "run with DATA_SOURCE=sim until one is configured.",
    );
  }

  pool = new Pool({
    connectionString: url,
    // The box runs one Next instance and one worker. Ten each is far more than
    // either needs and well inside Postgres's default hundred.
    max: Number(process.env.POSTGRES_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,
    // A read that hangs holds a request open; the page has a freshness
    // indicator counting up on it and no way to say the query is stuck.
    connectionTimeoutMillis: 5_000,
  });

  // Without a handler, a dropped backend connection is an unhandled 'error'
  // event, which takes the process down. The pool replaces the connection on
  // its own; all this does is stop the recovery being fatal.
  pool.on("error", (error) => {
    console.error(`[db] idle client error: ${error.message}`);
  });

  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, values as unknown[]);
  return result.rows;
}

/** One row or null. Throws if the query returned more than one. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, values);
  if (rows.length > 1) {
    throw new Error(`Expected at most one row, got ${rows.length}: ${text.slice(0, 60)}…`);
  }
  return rows[0] ?? null;
}

/**
 * A transaction. Rolls back on any throw.
 *
 * §3.3's proportional partial exit is two writes — the arrival row and the
 * day's rollup — and a crash between them leaves a rollup that disagrees with
 * the rows it was computed from. That disagreement is invisible until someone
 * checks a figure by hand, which is exactly the check this product invites.
 */
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Closes the pool. For scripts; the long-running processes never call it. */
export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/** Points every subsequent `getPool()` at a different database. For tests. */
export async function resetPool(): Promise<void> {
  await closePool();
}

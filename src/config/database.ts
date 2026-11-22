import { Pool, types } from 'pg';
import { config } from './env';

// PostgreSQL BIGINT (type OID 20) is returned by `pg` as a string by default,
// because it can exceed JavaScript's safe integer range (2^53 - 1).
// Our ids and COUNT(*) results will never get that large, so we convert them to
// numbers — but fail loudly instead of silently losing precision if they ever do.
types.setTypeParser(types.builtins.INT8, (value: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`BIGINT value ${value} exceeds JavaScript's safe integer range`);
  }
  return parsed;
});

/**
 * One shared connection pool for the whole application.
 * A pool keeps a few connections open and reuses them, which is much faster
 * than opening a new connection for every query.
 */
export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  // Automated tests always use the separate test database.
  database: config.isTest ? config.db.testName : config.db.name,
  max: 10, // maximum simultaneous connections
  idleTimeoutMillis: 30_000, // close connections idle for 30s
  connectionTimeoutMillis: 5_000, // fail fast if the database is unreachable
});

// An idle connection can break (e.g. the database restarts). Without this
// listener the error would crash the process; the pool discards the broken
// connection and creates a new one when needed.
pool.on('error', (err: Error) => {
  console.error('[database] Unexpected error on idle PostgreSQL client:', err.message);
});

/** Runs a trivial query to prove the database is reachable. Throws if it is not. */
export async function verifyDatabaseConnection(): Promise<void> {
  const result = await pool.query<{ database: string; server_time: Date }>(
    'SELECT current_database() AS database, NOW() AS server_time',
  );
  const { database, server_time } = result.rows[0];
  console.log(`[database] Connected to "${database}" (server time ${server_time.toISOString()})`);
}

/** Closes every connection in the pool. Call once when the process shuts down. */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('[database] Connection pool closed');
}

/**
 * Runs every .sql file in database/migrations in filename order (001_, 002_, ...).
 *
 *   npm run db:migrate        -> development database (DB_NAME)
 *   npm run db:migrate:test   -> test database (TEST_DB_NAME)
 *
 * Each migration file is idempotent and wraps itself in BEGIN/COMMIT,
 * so running this repeatedly is safe.
 */
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { Client } from 'pg';
import { config } from '../src/config/env';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate(): Promise<void> {
  const useTestDb = process.argv.includes('--test');
  const database = useTestDb ? config.db.testName : config.db.name;

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  const client = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database,
  });

  await client.connect();
  console.log(`Running ${files.length} migration(s) on "${database}"`);

  try {
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      // Trusted SQL from our own repository (no user input), so a plain query is correct here.
      await client.query(sql);
      console.log(`  ✔ ${file}`);
    }
    console.log('Migrations complete.');
  } finally {
    await client.end();
  }
}

migrate().catch((err: unknown) => {
  console.error('Migration failed:', err instanceof Error ? err.message || err.name : err);
  process.exit(1);
});

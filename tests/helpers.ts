import { config } from '../src/config/env';
import { pool } from '../src/config/database';
import * as userRepository from '../src/repositories/user.repository';
import type { PublicUser } from '../src/types';
import { signAccessToken } from '../src/utils/jwt';
import { hashPassword } from '../src/utils/password';

export const TEST_PASSWORD = 'Password123!';

export interface TestStaff {
  user: PublicUser;
  token: string;
  /** Ready-to-use Authorization header value. */
  auth: string;
}

/**
 * Empties the test database. Before deleting anything it asks PostgreSQL which
 * database we are connected to and refuses unless it is the configured test
 * database AND its name contains "test" (protection against a misconfigured .env).
 */
export async function resetDatabase(): Promise<void> {
  const { rows } = await pool.query<{ db: string }>('SELECT current_database() AS db');
  const connectedTo = rows[0].db;
  const looksLikeTestDb = /test/i.test(connectedTo);
  if (connectedTo !== config.db.testName || connectedTo === config.db.name || !looksLikeTestDb) {
    throw new Error(
      `Refusing to reset "${connectedTo}": tests must run against a dedicated test database ` +
        '(TEST_DB_NAME, different from DB_NAME, with "test" in its name).',
    );
  }
  await pool.query('TRUNCATE inquiries, users RESTART IDENTITY CASCADE');
}

/** Creates a staff account directly in the database and returns a valid token for it. */
export async function createStaff(name: string, email: string): Promise<TestStaff> {
  const user = await userRepository.create(name, email, await hashPassword(TEST_PASSWORD));
  const token = signAccessToken({ userId: user.id, email: user.email });
  return { user, token, auth: `Bearer ${token}` };
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

import { pool } from '../config/database';
import type { PublicUser, UserRecord } from '../types';

// Columns that are safe to return to clients. Listed explicitly (never SELECT *)
// so password_hash can never leak by accident.
const PUBLIC_COLUMNS = 'id, name, email, created_at';

/** Finds a user including the password hash. Use ONLY for checking login credentials. */
export async function findByEmailWithPassword(email: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function findById(id: number): Promise<PublicUser | null> {
  const result = await pool.query<PublicUser>(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/** Inserts a new user. Throws a unique-violation error (code 23505) if the email already exists. */
export async function create(name: string, email: string, passwordHash: string): Promise<PublicUser> {
  const result = await pool.query<PublicUser>(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING ${PUBLIC_COLUMNS}`,
    [name, email, passwordHash],
  );
  return result.rows[0];
}

/**
 * Inserts a user, or updates the name and password if the email already exists.
 * Used by the seed script so it can safely be run many times.
 */
export async function upsertByEmail(
  name: string,
  email: string,
  passwordHash: string,
): Promise<PublicUser> {
  const result = await pool.query<PublicUser>(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email)
     DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
     RETURNING ${PUBLIC_COLUMNS}`,
    [name, email, passwordHash],
  );
  return result.rows[0];
}

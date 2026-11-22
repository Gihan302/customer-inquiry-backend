import bcrypt from 'bcryptjs';
import { config } from '../config/env';

/**
 * Hashes a plain-text password with bcrypt.
 * bcrypt adds a random salt automatically and stores it inside the hash,
 * so two users with the same password still get different hashes.
 */
export function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, config.bcryptSaltRounds);
}

/** Checks a plain-text password against a stored bcrypt hash. */
export function comparePassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

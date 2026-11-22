import jwt, { JsonWebTokenError, type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config/env';
import type { AuthUser } from '../types';

// Pin the algorithm so a token signed with a different algorithm is never accepted.
const ALGORITHM = 'HS256';

// The shape we expect inside a verified token. A correctly signed token with
// an unexpected payload is still rejected.
const tokenPayloadSchema = z.object({
  userId: z.number().int().positive(),
  email: z.email(),
});

/** Creates a signed access token containing only the user's id and email. */
export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ userId: user.userId, email: user.email }, config.jwt.secret, {
    algorithm: ALGORITHM,
    // Format already validated in env.ts (e.g. "1h", "15m", "3600").
    expiresIn: config.jwt.expiresIn as NonNullable<SignOptions['expiresIn']>,
  });
}

/**
 * Verifies the signature and expiry of a token and returns its payload.
 * Throws TokenExpiredError for expired tokens and JsonWebTokenError for any other problem.
 */
export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, config.jwt.secret, { algorithms: [ALGORITHM] });

  const parsed = tokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new JsonWebTokenError('invalid token payload');
  }
  return { userId: parsed.data.userId, email: parsed.data.email };
}

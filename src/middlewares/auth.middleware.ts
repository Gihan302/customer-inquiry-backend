import type { NextFunction, Request, Response } from 'express';
import { TokenExpiredError } from 'jsonwebtoken';
import type { AuthUser } from '../types';
import { AppError } from '../utils/appError';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Protects a route with JWT Bearer authentication.
 *
 *   Authorization: Bearer <token>
 *
 * On success, sets req.user = { userId, email } from the VERIFIED token.
 * This is the only trusted source of "who is calling"; user ids sent in
 * request bodies or URLs are never used for identity.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header) {
    next(AppError.unauthorized('Authentication required. Provide a Bearer token.'));
    return;
  }

  const [scheme, token, ...extra] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token || extra.length > 0) {
    next(AppError.unauthorized('Authorization header must be in the format: Bearer <token>'));
    return;
  }

  let user: AuthUser;
  try {
    user = verifyAccessToken(token);
  } catch (err) {
    const message = err instanceof TokenExpiredError ? 'Token has expired' : 'Invalid token';
    next(AppError.unauthorized(message));
    return;
  }

  req.user = user;
  next();
}

/**
 * Returns the authenticated user inside a controller.
 * Throws 401 if used on a route that forgot the authenticate middleware.
 */
export function getAuthUser(req: Request): AuthUser {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user;
}

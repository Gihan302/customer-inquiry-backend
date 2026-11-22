import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/appError';

/** True only if the request actually carries body bytes. */
function hasBodyContent(req: Request): boolean {
  if (req.headers['transfer-encoding'] !== undefined) return true; // chunked upload
  return Number(req.headers['content-length'] ?? 0) > 0;
}

/**
 * Rejects request bodies that are not JSON with 415 Unsupported Media Type.
 *
 * Without this, a form-encoded or plain-text body would simply be ignored by
 * express.json() and the client would get a confusing "field is required" error.
 *
 * Requests with an empty body (e.g. GET, or POST with Content-Length: 0) are
 * let through, so they reach authentication and validation normally.
 */
export function requireJson(req: Request, _res: Response, next: NextFunction): void {
  if (hasBodyContent(req) && !req.is('application/json')) {
    next(new AppError(415, 'Content-Type must be application/json'));
    return;
  }
  next();
}

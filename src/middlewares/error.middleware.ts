import type { ErrorRequestHandler } from 'express';
import { DatabaseError } from 'pg';
import { sendError } from '../utils/apiResponse';
import { AppError } from '../utils/appError';

// PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = '23505';
const PG_CONNECTION_ERROR_CODES = new Set([
  '08000', '08003', '08006', // connection exceptions
  '57P01', '57P02', '57P03', // server shutting down / not ready
]);
const NETWORK_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT']);

/** Errors produced by express.json() (body-parser) carry an HTTP status and a type. */
function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

function isDatabaseUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return (
    (code !== undefined && (PG_CONNECTION_ERROR_CODES.has(code) || NETWORK_ERROR_CODES.has(code))) ||
    err.message.includes('timeout exceeded when trying to connect') ||
    err.message.includes('Connection terminated')
  );
}

/**
 * Central error handler: every error thrown or passed to next() ends up here
 * and is converted into the standard { success: false, message, errors } JSON.
 * Internal details (SQL, stack traces, credentials) are logged on the server,
 * never sent to the client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // If part of the response was already sent we cannot send a JSON error any more;
  // Express's default handler will close the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  // 1. Expected errors thrown on purpose by our own code.
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.message, err.errors);
    return;
  }

  // 2. Problems with the raw request body.
  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      sendError(res, 400, 'Request body contains invalid JSON');
      return;
    }
    if (err.type === 'entity.too.large') {
      sendError(res, 413, 'Request body is too large');
      return;
    }
    // Other client-side body problems (unsupported charset/encoding, aborted upload, ...).
    if (err.status >= 400 && err.status < 500) {
      sendError(res, err.status, 'Request body could not be processed');
      return;
    }
  }

  // 3. Known database errors.
  if (err instanceof DatabaseError && err.code === PG_UNIQUE_VIOLATION) {
    sendError(res, 409, 'A record with the same unique value already exists');
    return;
  }
  if (isDatabaseUnavailable(err)) {
    console.error(`[error] Database unavailable during ${req.method} ${req.originalUrl}:`, err);
    sendError(res, 503, 'Service temporarily unavailable. Please try again later.');
    return;
  }

  // 4. Anything else is a bug: log everything, reveal nothing.
  console.error(`[error] Unhandled error during ${req.method} ${req.originalUrl}:`, err);
  sendError(res, 500, 'Internal server error');
};

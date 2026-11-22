import type { ErrorDetail } from '../types';

/**
 * An expected, "operational" error with an HTTP status code
 * (bad input, not logged in, not found, ...).
 * Services throw these; the central error middleware turns them into JSON responses.
 * Any other error is treated as an unexpected 500.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, errors: ErrorDetail[] = []): AppError {
    return new AppError(400, message, errors);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, message);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, message);
  }
}

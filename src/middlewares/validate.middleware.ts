import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import type { ErrorDetail } from '../types';
import { AppError } from '../utils/appError';

interface RequestSchemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

const SOURCES = ['params', 'query', 'body'] as const;

/**
 * Validates parts of the request with Zod schemas before the controller runs.
 *
 * - Invalid input -> 400 "Validation failed" with a list of { field, message }.
 * - Valid input   -> the request is replaced with the parsed data, so the
 *                    controller receives trimmed / converted values and
 *                    unknown fields are stripped.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: ErrorDetail[] = [];
    const parsed: Partial<Record<(typeof SOURCES)[number], unknown>> = {};

    for (const source of SOURCES) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);
      if (result.success) {
        parsed[source] = result.data;
      } else {
        for (const issue of result.error.issues) {
          errors.push({ field: issue.path.join('.') || source, message: issue.message });
        }
      }
    }

    if (errors.length > 0) {
      next(AppError.badRequest('Validation failed', errors));
      return;
    }

    if (parsed.body !== undefined) req.body = parsed.body;
    if (parsed.params !== undefined) req.params = parsed.params as Request['params'];
    if (parsed.query !== undefined) {
      // In Express 5, req.query is a read-only getter, so it is redefined instead of assigned.
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    next();
  };
}

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/appError';

/** Catches requests that matched no route and returns a JSON 404. */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

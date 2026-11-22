import type { Response } from 'express';
import type { ApiErrorResponse, ApiSuccessResponse, ErrorDetail } from '../types';

/** Sends the standard success envelope: { success: true, message, data }. */
export function sendSuccess<T>(res: Response, statusCode: number, message: string, data: T): void {
  const body: ApiSuccessResponse<T> = { success: true, message, data };
  res.status(statusCode).json(body);
}

/** Sends the standard error envelope: { success: false, message, errors }. */
export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  errors: ErrorDetail[] = [],
): void {
  const body: ApiErrorResponse = { success: false, message, errors };
  res.status(statusCode).json(body);
}

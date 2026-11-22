import type { Request, Response } from 'express';
import { getAuthUser } from '../middlewares/auth.middleware';
import * as authService from '../services/auth.service';
import { sendSuccess } from '../utils/apiResponse';
import type { LoginInput } from '../validators/auth.validator';

// Controllers only translate HTTP <-> service calls. Business logic lives in services.
// Express 5 forwards errors thrown in async handlers to the error middleware automatically.

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  // Body has already been validated and normalised by validate(loginSchema).
  const { email, password } = req.body as LoginInput;
  const result = await authService.login(email, password);
  sendSuccess(res, 200, 'Login successful', result);
}

/** GET /api/auth/me */
export async function me(req: Request, res: Response): Promise<void> {
  const { userId } = getAuthUser(req);
  const user = await authService.getCurrentUser(userId);
  sendSuccess(res, 200, 'Authenticated user retrieved successfully', { user });
}

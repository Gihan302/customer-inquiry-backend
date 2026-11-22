import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { config } from './config/env';
import { errorHandler } from './middlewares/error.middleware';
import { notFound } from './middlewares/notFound.middleware';
import { requireJson } from './middlewares/requireJson.middleware';
import authRoutes from './routes/auth.routes';
import inquiryRoutes from './routes/inquiry.routes';
import { sendSuccess } from './utils/apiResponse';

// Largest legitimate body is an inquiry with a 5000-character description
// (worst case ~20 KB of UTF-8), so 50 KB leaves headroom while rejecting abuse.
const JSON_BODY_LIMIT = '50kb';

/**
 * Builds the Express application.
 * Kept separate from server.ts so tests can import the app
 * without opening a network port.
 */
export function createApp(): Application {
  const app = express();

  // ---- Security middleware (runs before anything else) ----

  // Secure HTTP headers: X-Content-Type-Options, X-Frame-Options,
  // Strict-Transport-Security, Content-Security-Policy, ... and removes X-Powered-By.
  app.use(helmet());

  // Only the configured frontend may call this API from a browser.
  // credentials: false because authentication uses the Authorization header, not cookies.
  // (CORS is enforced by browsers; non-browser clients are stopped by JWT auth instead.)
  app.use(
    cors({
      origin: config.frontendUrl,
      methods: ['GET', 'POST', 'PUT', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
      maxAge: 600, // browsers may cache the preflight response for 10 minutes
    }),
  );

  // ---- Body parsing ----
  app.use(requireJson);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // API responses can contain Private inquiries: never let browsers or proxies cache them.
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ---- Routes ----
  app.get('/api/health', (_req: Request, res: Response) => {
    sendSuccess(res, 200, 'API is running', {});
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/inquiries', inquiryRoutes);

  // ---- Must come after all routes ----
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

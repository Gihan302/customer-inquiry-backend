import dotenv from 'dotenv';
import { z } from 'zod';

// Load variables from .env into process.env.
// Variables that are already set (e.g. NODE_ENV=test set by Jest) are NOT overridden.
dotenv.config({ quiet: true });

const nonEmpty = (name: string) => z.string().trim().min(1, `${name} is required`);

const envSchema = z
  .object({
    // ---- Server ----
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    FRONTEND_URL: z.url('FRONTEND_URL must be a valid URL, e.g. http://localhost:5173'),

    // ---- PostgreSQL ----
    DB_HOST: nonEmpty('DB_HOST'),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DB_NAME: nonEmpty('DB_NAME'),
    DB_USER: nonEmpty('DB_USER'),
    DB_PASSWORD: z.string(),
    // Separate database used only by automated tests (never the dev database).
    TEST_DB_NAME: nonEmpty('TEST_DB_NAME').default('customer_inquiry_test_db'),

    // ---- Auth ----
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
    // Same format jsonwebtoken accepts: a number of seconds or e.g. "15m", "1h", "7d".
    JWT_EXPIRES_IN: z
      .string()
      .trim()
      .regex(/^\d+(ms|s|m|h|d|w|y)?$/, 'JWT_EXPIRES_IN must look like "3600", "15m", "1h" or "7d"'),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  })
  .refine((env) => env.TEST_DB_NAME !== env.DB_NAME, {
    message: 'TEST_DB_NAME must be different from DB_NAME so tests never touch development data',
    path: ['TEST_DB_NAME'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // List only variable names and rule messages, never the values (they may be secrets).
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Configuration errors are unrecoverable: print a clear message and stop,
  // instead of crashing later with a confusing error deep inside the app.
  console.error(`Invalid environment configuration (check your .env file):\n${problems}`);
  process.exit(1);
}

const env = parsed.data;

/** Validated, typed application configuration. Import this instead of using process.env. */
export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  frontendUrl: env.FRONTEND_URL,
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    name: env.DB_NAME,
    testName: env.TEST_DB_NAME,
  },
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
} as const;

export type AppConfig = typeof config;

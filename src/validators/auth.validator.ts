import { z } from 'zod';

/** Email: trimmed and lower-cased first (the database stores emails in lower case), then checked. */
export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email('Email must be a valid email address')
      .max(150, 'Email must be at most 150 characters'),
  );

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required')
    // bcrypt only uses the first 72 bytes of a password.
    .max(72, 'Password must be at most 72 characters'),
});

/** Used by the create-staff command-line script (there is no public registration endpoint). */
export const createStaffSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

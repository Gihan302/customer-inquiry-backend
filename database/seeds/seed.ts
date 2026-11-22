/**
 * Seeds the initial staff accounts.
 *
 *   npm run db:seed
 *
 * Safe to run repeatedly: existing accounts (matched by email) are updated,
 * not duplicated. Passwords are stored only as bcrypt hashes.
 *
 * Password: SEED_STAFF_PASSWORD from the environment, or the documented local
 * development default below. The default is refused when NODE_ENV=production.
 */
import { config } from '../../src/config/env';
import { closePool } from '../../src/config/database';
import * as userRepository from '../../src/repositories/user.repository';
import { hashPassword } from '../../src/utils/password';
import { createStaffSchema } from '../../src/validators/auth.validator';

const DEFAULT_DEV_PASSWORD = 'Password123!';

const STAFF = [
  { name: 'Staff One', email: 'staff1@example.com' },
  { name: 'Staff Two', email: 'staff2@example.com' },
];

async function seed(): Promise<void> {
  const fromEnv = process.env.SEED_STAFF_PASSWORD;
  if (config.isProduction && !fromEnv) {
    throw new Error('Refusing to seed production with the default password. Set SEED_STAFF_PASSWORD.');
  }
  const password = fromEnv ?? DEFAULT_DEV_PASSWORD;

  console.log(`Seeding staff accounts into "${config.isTest ? config.db.testName : config.db.name}"`);

  for (const staff of STAFF) {
    // Same rules as any other staff account (valid email, password length, ...).
    const input = createStaffSchema.parse({ ...staff, password });
    const user = await userRepository.upsertByEmail(
      input.name,
      input.email,
      await hashPassword(input.password),
    );
    console.log(`  ✔ ${user.email} (id ${user.id})`);
  }

  console.log(
    fromEnv
      ? 'Done. Password: value of SEED_STAFF_PASSWORD.'
      : `Done. Local development password for all seeded accounts: ${DEFAULT_DEV_PASSWORD}`,
  );
}

seed()
  .catch((err: unknown) => {
    console.error('Seeding failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());

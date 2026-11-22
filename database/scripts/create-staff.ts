/**
 * Creates an additional staff account from the command line.
 * This replaces a public registration endpoint: only someone with access to
 * the server and its .env file can create accounts.
 *
 *   npm run staff:create -- --name "Jane Perera" --email jane@example.com
 *
 * A strong random password is generated and printed ONCE, so it never has to
 * be typed on the command line (where it would be saved in shell history).
 * To choose the password yourself, set the STAFF_PASSWORD environment variable.
 */
import { randomBytes } from 'crypto';
import { parseArgs } from 'util';
import { DatabaseError } from 'pg';
import { closePool } from '../../src/config/database';
import * as userRepository from '../../src/repositories/user.repository';
import { hashPassword } from '../../src/utils/password';
import { createStaffSchema } from '../../src/validators/auth.validator';

async function createStaff(): Promise<void> {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      email: { type: 'string' },
    },
  });

  const generated = !process.env.STAFF_PASSWORD;
  const password = process.env.STAFF_PASSWORD ?? randomBytes(12).toString('base64url');

  const parsed = createStaffSchema.safeParse({ name: values.name, email: values.email, password });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Invalid input:\n${problems.join('\n')}\n` +
        'Usage: npm run staff:create -- --name "Jane Perera" --email jane@example.com',
    );
  }

  const { name, email } = parsed.data;
  try {
    const user = await userRepository.create(name, email, await hashPassword(parsed.data.password));
    console.log(`Staff account created: ${user.name} <${user.email}> (id ${user.id})`);
    if (generated) {
      console.log(`Temporary password (shown only once): ${password}`);
    }
  } catch (err) {
    if (err instanceof DatabaseError && err.code === '23505') {
      throw new Error(`A staff account with the email ${email} already exists`);
    }
    throw err;
  }
}

createStaff()
  .catch((err: unknown) => {
    console.error('Could not create staff account:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());

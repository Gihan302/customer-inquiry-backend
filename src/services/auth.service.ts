import { config } from '../config/env';
import * as userRepository from '../repositories/user.repository';
import type { PublicUser } from '../types';
import { AppError } from '../utils/appError';
import { signAccessToken } from '../utils/jwt';
import { comparePassword, hashPassword } from '../utils/password';

export interface LoginResult {
  token: string;
  token_type: 'Bearer';
  expires_in: string;
  user: PublicUser;
}

// Deliberately vague: never reveal whether it was the email or the password that was wrong.
const INVALID_CREDENTIALS = 'Invalid email or password';

// A real bcrypt hash (of a random value) used when the email does not exist, so
// that case takes as long as a wrong password and response timing does not
// reveal which emails have accounts. Created once, on first use.
let dummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(`dummy-${Math.random()}`);
  return dummyHashPromise;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await userRepository.findByEmailWithPassword(email);

  const passwordMatches = await comparePassword(
    password,
    user ? user.password_hash : await getDummyHash(),
  );

  if (!user || !passwordMatches) {
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  // Strip the hash before the user object goes anywhere near a response.
  const { password_hash: _passwordHash, ...publicUser } = user;

  return {
    token: signAccessToken({ userId: user.id, email: user.email }),
    token_type: 'Bearer',
    expires_in: config.jwt.expiresIn,
    user: publicUser,
  };
}

/** Returns the account behind a verified token, or 401 if it no longer exists. */
export async function getCurrentUser(userId: number): Promise<PublicUser> {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw AppError.unauthorized('User account no longer exists');
  }
  return user;
}

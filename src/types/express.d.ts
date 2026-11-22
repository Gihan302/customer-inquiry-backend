import type { AuthUser } from './index';

// Declaration merging: adds a typed `user` property to Express's Request.
// It is set by the authenticate middleware after the JWT has been verified.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};

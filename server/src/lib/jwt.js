import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

/**
 * `campusId` must be the campus the token is being issued for. For the single
 * global Super Admin the caller substitutes the requested campus before
 * signing so all normal campus scoping keeps working.
 */
export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      id: user.id,
      campusId: user.campusId,
      isGlobal: user.isGlobal === true,
      role: user.role,
      name: user.name,
      email: user.email
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

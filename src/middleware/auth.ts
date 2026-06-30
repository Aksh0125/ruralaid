import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError, ErrorCode, ForbiddenError } from './errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';

export type UserRole = 'PATIENT' | 'DOCTOR';

export interface JwtPayload {
  sub: string;   // user UUID
  role: UserRole;
  iat: number;
  exp: number;
}

// Extend Express Request to carry the decoded user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Issue a signed JWT for a given user */
export function issueJwt(sub: string, role: UserRole): string {
  return jwt.sign({ sub, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/** Verify a JWT string and return the decoded payload, or throw */
export function verifyJwt(token: string): JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    throw new AppError(ErrorCode.ACCESS_DENIED, 'Invalid or expired token.', 401);
  }
}

/**
 * Middleware: extract Bearer token from Authorization header,
 * verify it, and attach decoded payload to req.user.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError(ErrorCode.ACCESS_DENIED, 'Authorization header missing or malformed.', 401)
    );
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    req.user = verifyJwt(token);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware factory: only allow users with a specific role.
 * Must be used after requireAuth.
 *
 * Usage: router.get('/doctors/me', requireAuth, requireRole('DOCTOR'), handler)
 */
export function requireRole(role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== role) {
      return next(new ForbiddenError(`This endpoint requires the ${role} role.`));
    }
    next();
  };
}

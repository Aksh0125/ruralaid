import { Request, Response, NextFunction } from 'express';

/**
 * Domain error codes used across all services.
 * These map to the error schema defined in design.md.
 */
export const ErrorCode = {
  // Auth
  PHONE_ALREADY_IN_USE: 'PHONE_ALREADY_IN_USE',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_MAX_ATTEMPTS: 'OTP_MAX_ATTEMPTS',
  // Doctor registration
  LICENSE_DUPLICATE: 'LICENSE_DUPLICATE',
  LICENSE_FORMAT_INVALID: 'LICENSE_FORMAT_INVALID',
  // Consultation
  ACTIVE_REQUEST_EXISTS: 'ACTIVE_REQUEST_EXISTS',
  LOCATION_UNAVAILABLE: 'LOCATION_UNAVAILABLE',
  REQUEST_ALREADY_ACCEPTED: 'REQUEST_ALREADY_ACCEPTED',
  // Treatment plan
  PLAN_NOT_ACCEPTED_FIRST: 'PLAN_NOT_ACCEPTED_FIRST',
  PLAN_VALIDATION_FAILED: 'PLAN_VALIDATION_FAILED',
  // Payment
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_MAX_RETRIES: 'PAYMENT_MAX_RETRIES',
  PAYMENT_TIMEOUT: 'PAYMENT_TIMEOUT',
  // Access control
  ACCESS_DENIED: 'ACCESS_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Base application error.
 * Always serializes to: { error: { code, message, field? } }
 */
export class AppError extends Error {
  public readonly code: ErrorCodeType;
  public readonly field?: string;
  public readonly statusCode: number;

  constructor(
    code: ErrorCodeType,
    message: string,
    statusCode = 400,
    field?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
  }
}

/** Convenience subclasses for common HTTP statuses */
export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(ErrorCode.VALIDATION_ERROR, message, 422, field);
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCodeType, message: string, field?: string) {
    super(code, message, 409, field);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(ErrorCode.ACCESS_DENIED, message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(ErrorCode.NOT_FOUND, message, 404);
  }
}

/**
 * Express global error handler — must be registered last with app.use().
 * Converts any AppError (or unknown error) into the standard error envelope.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.field ? { field: err.field } : {}),
      },
    });
    return;
  }

  // Unexpected errors — don't leak internals in production
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
}

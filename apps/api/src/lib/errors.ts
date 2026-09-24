export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  POOL_FULL: 'POOL_FULL',
  NOT_COMPATIBLE: 'NOT_COMPATIBLE',
  ACTIVE_RIDE_EXISTS: 'ACTIVE_RIDE_EXISTS',
  ACTIVE_POOL_EXISTS: 'ACTIVE_POOL_EXISTS',
  REQUEST_ALREADY_MATCHED: 'REQUEST_ALREADY_MATCHED',
  DRIVER_OFFLINE: 'DRIVER_OFFLINE',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** Map Postgres constraint names to domain error codes (DESIGN §10.3). */
const CONSTRAINT_MAP: Record<string, { status: number; code: ErrorCode; message: string }> = {
  one_active_request_per_passenger: {
    status: 409,
    code: ErrorCodes.ACTIVE_RIDE_EXISTS,
    message: 'You already have an active ride. Finish or cancel it before requesting another.',
  },
  one_active_pool_per_vehicle: {
    status: 409,
    code: ErrorCodes.ACTIVE_POOL_EXISTS,
    message: 'This Tesla is already on an active pool.',
  },
  pools_seats_within_capacity: {
    status: 409,
    code: ErrorCodes.POOL_FULL,
    message: "Bullet just filled up. You're still in the queue for the next Tesla.",
  },
  users_email_lower_uidx: {
    status: 409,
    code: ErrorCodes.EMAIL_TAKEN,
    message: 'An account with this email already exists.',
  },
  one_active_membership_per_request: {
    status: 409,
    code: ErrorCodes.REQUEST_ALREADY_MATCHED,
    message: 'This ride is already in a pool.',
  },
  wallets_balance_nonneg: {
    status: 422,
    code: ErrorCodes.INSUFFICIENT_BALANCE,
    message: 'Your TeslaPay balance is too low for this ride.',
  },
};

export function mapPostgresError(err: {
  code?: string;
  constraint?: string;
}): AppError | null {
  if (err.code !== '23505' && err.code !== '23514') return null;
  const constraint = err.constraint;
  if (!constraint) return null;
  const mapped = CONSTRAINT_MAP[constraint];
  if (!mapped) return null;
  return new AppError(mapped.status, mapped.code, mapped.message, { constraint });
}

export function extractPgError(err: unknown): { code?: string; constraint?: string } | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { code?: string; constraint?: string; cause?: unknown };
  if (e.code && (e.code.startsWith('23') || e.constraint)) {
    return { code: e.code, constraint: e.constraint };
  }
  if (e.cause) return extractPgError(e.cause);
  return null;
}

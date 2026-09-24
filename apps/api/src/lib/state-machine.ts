import type { PoolStatus, RequestStatus } from '@teslapool/shared';
import { PoolStatus as PoolStatuses, RequestStatus as RequestStatuses } from '@teslapool/shared';
import { AppError, ErrorCodes } from './errors.js';

export const REQUEST_TRANSITIONS = {
  REQUESTED: ['MATCHED', 'CANCELLED'],
  MATCHED: ['DRIVER_ARRIVED', 'CANCELLED', 'REQUESTED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED', 'REQUESTED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
} as const satisfies Record<RequestStatus, readonly RequestStatus[]>;

export const POOL_TRANSITIONS = {
  ACCEPTED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
} as const satisfies Record<PoolStatus, readonly PoolStatus[]>;

export type TransitionMachine = 'request' | 'pool';

/** Statuses that count as an "active" ride request (matches partial unique index). */
export const ACTIVE_REQUEST_STATUSES: readonly RequestStatus[] = [
  RequestStatuses.REQUESTED,
  RequestStatuses.MATCHED,
  RequestStatuses.DRIVER_ARRIVED,
  RequestStatuses.STARTED,
];

/** Pool statuses that still accept new members (matches matching index). */
export const JOINABLE_POOL_STATUSES: readonly PoolStatus[] = [
  PoolStatuses.ACCEPTED,
  PoolStatuses.DRIVER_ARRIVED,
];

export function isActiveRequestStatus(status: RequestStatus): boolean {
  return (ACTIVE_REQUEST_STATUSES as readonly string[]).includes(status);
}

export function isJoinablePoolStatus(status: PoolStatus): boolean {
  return (JOINABLE_POOL_STATUSES as readonly string[]).includes(status);
}

export function canTransition(
  machine: TransitionMachine,
  from: string,
  to: string,
): boolean {
  const table = machine === 'request' ? REQUEST_TRANSITIONS : POOL_TRANSITIONS;
  const allowed = (table as Record<string, readonly string[]>)[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertTransition(
  machine: TransitionMachine,
  from: string,
  to: string,
): void {
  if (!canTransition(machine, from, to)) {
    throw new AppError(
      409,
      ErrorCodes.INVALID_TRANSITION,
      `Cannot move ${machine} from ${from} to ${to}`,
      { machine, from, to },
    );
  }
}

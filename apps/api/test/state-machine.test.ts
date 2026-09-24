import { PoolStatus, RequestStatus } from '@teslapool/shared';
import { describe, expect, it } from 'vitest';
import { AppError, ErrorCodes } from '../src/lib/errors.js';
import {
  POOL_TRANSITIONS,
  REQUEST_TRANSITIONS,
  assertTransition,
  canTransition,
  isActiveRequestStatus,
  isJoinablePoolStatus,
} from '../src/lib/state-machine.js';

describe('state machines', () => {
  it('enumerates every request from/to pair', () => {
    const statuses = Object.keys(REQUEST_TRANSITIONS) as (keyof typeof REQUEST_TRANSITIONS)[];
    for (const from of statuses) {
      for (const to of statuses) {
        const allowed = REQUEST_TRANSITIONS[from].includes(to as never);
        expect(canTransition('request', from, to)).toBe(allowed);
        if (allowed) {
          expect(() => assertTransition('request', from, to)).not.toThrow();
        } else {
          expect(() => assertTransition('request', from, to)).toThrow(AppError);
          try {
            assertTransition('request', from, to);
          } catch (err) {
            expect(err).toBeInstanceOf(AppError);
            expect((err as AppError).code).toBe(ErrorCodes.INVALID_TRANSITION);
            expect((err as AppError).statusCode).toBe(409);
          }
        }
      }
    }
  });

  it('enumerates every pool from/to pair', () => {
    const statuses = Object.keys(POOL_TRANSITIONS) as (keyof typeof POOL_TRANSITIONS)[];
    for (const from of statuses) {
      for (const to of statuses) {
        const allowed = POOL_TRANSITIONS[from].includes(to as never);
        expect(canTransition('pool', from, to)).toBe(allowed);
        if (allowed) {
          expect(() => assertTransition('pool', from, to)).not.toThrow();
        } else {
          expect(() => assertTransition('pool', from, to)).toThrow(AppError);
        }
      }
    }
  });

  it('matches active / joinable helpers to index predicates', () => {
    expect(isActiveRequestStatus(RequestStatus.REQUESTED)).toBe(true);
    expect(isActiveRequestStatus(RequestStatus.MATCHED)).toBe(true);
    expect(isActiveRequestStatus(RequestStatus.COMPLETED)).toBe(false);
    expect(isActiveRequestStatus(RequestStatus.CANCELLED)).toBe(false);

    expect(isJoinablePoolStatus(PoolStatus.ACCEPTED)).toBe(true);
    expect(isJoinablePoolStatus(PoolStatus.DRIVER_ARRIVED)).toBe(true);
    expect(isJoinablePoolStatus(PoolStatus.STARTED)).toBe(false);
    expect(isJoinablePoolStatus(PoolStatus.COMPLETED)).toBe(false);
  });
});

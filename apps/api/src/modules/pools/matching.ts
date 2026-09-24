import type { PoolStatus } from '@teslapool/shared';
import { isJoinablePoolStatus } from '../../lib/state-machine.js';

export type MatchPool = {
  status: PoolStatus;
  isShared: boolean;
  pickupZoneId: number;
  seatsTaken: number;
  capacity: number;
};

export type MatchMember = {
  dropoffZoneId: number;
  /** Optional label for TOO_FAR reasons (slug preferred). */
  dropoffZoneSlug?: string;
};

export type MatchRequest = {
  allowPool: boolean;
  pickupZoneId: number;
  dropoffZoneId: number;
  seats: number;
};

export type CompatibilityOk = { ok: true };
export type CompatibilityFail = {
  ok: false;
  reason:
    | 'NOT_SHARED'
    | 'DIFFERENT_PICKUP'
    | 'NO_SEATS'
    | 'NOT_JOINABLE'
    | `TOO_FAR:${string}`;
};

export type CompatibilityResult = CompatibilityOk | CompatibilityFail;

export type CompatibilityInput = {
  pool: MatchPool;
  members: readonly MatchMember[];
  request: MatchRequest;
  /** Distance in metres between two zone ids (directed or undirected table). */
  distanceM: (fromZoneId: number, toZoneId: number) => number | undefined;
  detourLimitM: number;
};

/**
 * PRD §7 matching rule — pure, deterministic, used by claimSeats and candidate lists.
 */
export function isCompatible(input: CompatibilityInput): CompatibilityResult {
  const { pool, members, request, distanceM, detourLimitM } = input;

  if (!isJoinablePoolStatus(pool.status)) {
    return { ok: false, reason: 'NOT_JOINABLE' };
  }
  if (!pool.isShared || !request.allowPool) {
    return { ok: false, reason: 'NOT_SHARED' };
  }
  if (request.pickupZoneId !== pool.pickupZoneId) {
    return { ok: false, reason: 'DIFFERENT_PICKUP' };
  }
  if (pool.seatsTaken + request.seats > pool.capacity) {
    return { ok: false, reason: 'NO_SEATS' };
  }

  for (const member of members) {
    const spread = distanceM(request.dropoffZoneId, member.dropoffZoneId);
    if (spread === undefined || spread > detourLimitM) {
      const label = member.dropoffZoneSlug ?? String(member.dropoffZoneId);
      return { ok: false, reason: `TOO_FAR:${label}` };
    }
  }

  return { ok: true };
}

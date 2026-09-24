import { PoolStatus } from '@teslapool/shared';
import { describe, expect, it } from 'vitest';
import { isCompatible } from '../src/modules/pools/matching.js';

/** Seeded zone ids (DESIGN §5 / seed). */
const BANANI = 1;
const GULSHAN_1 = 2;
const GULSHAN_2 = 3;
const MOHAKHALI = 4;
const UTTARA = 9;

/** Subset of seeded directed distances in metres. */
const DISTANCES: Record<string, number> = {
  [`${MOHAKHALI}:${GULSHAN_1}`]: 1_600,
  [`${GULSHAN_1}:${MOHAKHALI}`]: 1_600,
  [`${GULSHAN_2}:${MOHAKHALI}`]: 2_900,
  [`${MOHAKHALI}:${GULSHAN_2}`]: 2_900,
  [`${GULSHAN_2}:${GULSHAN_1}`]: 2_200,
  [`${GULSHAN_1}:${GULSHAN_2}`]: 2_200,
  [`${UTTARA}:${MOHAKHALI}`]: 15_700,
  [`${MOHAKHALI}:${UTTARA}`]: 15_700,
  [`${UTTARA}:${GULSHAN_1}`]: 15_700,
  [`${GULSHAN_1}:${UTTARA}`]: 15_700,
};

function distanceM(from: number, to: number): number | undefined {
  if (from === to) return 0;
  return DISTANCES[`${from}:${to}`];
}

const DETOUR = 3_000;

describe('isCompatible matching rule', () => {
  const openPool = {
    status: PoolStatus.ACCEPTED,
    isShared: true,
    pickupZoneId: BANANI,
    seatsTaken: 1,
    capacity: 3,
  };

  it('accepts Nusrat + Rafiq (Mohakhali ↔ Gulshan 1 = 1.6 km)', () => {
    const result = isCompatible({
      pool: openPool,
      members: [{ dropoffZoneId: MOHAKHALI, dropoffZoneSlug: 'mohakhali' }],
      request: {
        allowPool: true,
        pickupZoneId: BANANI,
        dropoffZoneId: GULSHAN_1,
        seats: 1,
      },
      distanceM,
      detourLimitM: DETOUR,
    });
    expect(result).toEqual({ ok: true });
  });

  it('accepts + Shirin to Gulshan 2 within detour of both members', () => {
    const result = isCompatible({
      pool: { ...openPool, seatsTaken: 2 },
      members: [
        { dropoffZoneId: MOHAKHALI, dropoffZoneSlug: 'mohakhali' },
        { dropoffZoneId: GULSHAN_1, dropoffZoneSlug: 'gulshan-1' },
      ],
      request: {
        allowPool: true,
        pickupZoneId: BANANI,
        dropoffZoneId: GULSHAN_2,
        seats: 1,
      },
      distanceM,
      detourLimitM: DETOUR,
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects Shirin to Uttara with TOO_FAR', () => {
    const result = isCompatible({
      pool: openPool,
      members: [{ dropoffZoneId: MOHAKHALI, dropoffZoneSlug: 'mohakhali' }],
      request: {
        allowPool: true,
        pickupZoneId: BANANI,
        dropoffZoneId: UTTARA,
        seats: 1,
      },
      distanceM,
      detourLimitM: DETOUR,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.startsWith('TOO_FAR:')).toBe(true);
    }
  });

  it('rejects allowPool=false with NOT_SHARED', () => {
    const result = isCompatible({
      pool: openPool,
      members: [{ dropoffZoneId: MOHAKHALI }],
      request: {
        allowPool: false,
        pickupZoneId: BANANI,
        dropoffZoneId: GULSHAN_1,
        seats: 1,
      },
      distanceM,
      detourLimitM: DETOUR,
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_SHARED' });
  });

  it('rejects when 3 seats are already taken', () => {
    const result = isCompatible({
      pool: { ...openPool, seatsTaken: 3 },
      members: [
        { dropoffZoneId: MOHAKHALI },
        { dropoffZoneId: GULSHAN_1 },
        { dropoffZoneId: GULSHAN_2 },
      ],
      request: {
        allowPool: true,
        pickupZoneId: BANANI,
        dropoffZoneId: GULSHAN_1,
        seats: 1,
      },
      distanceM,
      detourLimitM: DETOUR,
    });
    expect(result).toEqual({ ok: false, reason: 'NO_SEATS' });
  });
});

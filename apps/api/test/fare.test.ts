import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TARIFF,
  assertValidTariff,
  distanceCharge,
  quoteFare,
} from '../src/modules/fares/fare.js';

describe('fare engine', () => {
  const tariff = DEFAULT_TARIFF;

  it('rejects invalid tariffs', () => {
    expect(() => assertValidTariff({ ...tariff, perKmPaisa: 2501 })).toThrow(/divisible by 10/);
    expect(() => assertValidTariff({ ...tariff, poolDiscountPercent: 51 })).toThrow(/0 and 50/);
  });

  it('reproduces the PRD worked example cell by cell', () => {
    // Nusrat Banani → Mohakhali 2.5 km
    expect(distanceCharge(2_500, tariff)).toBe(6_250);
    expect(quoteFare(2_500, 1, tariff)).toEqual({
      base: 4_000,
      distance: 6_250,
      discount: 0,
      total: 10_250,
    });
    expect(quoteFare(2_500, 2, tariff)).toEqual({
      base: 4_000,
      distance: 6_250,
      discount: 1_250,
      total: 9_000,
    });

    // Rafiq Banani → Gulshan 1 2.8 km
    expect(distanceCharge(2_800, tariff)).toBe(7_000);
    expect(quoteFare(2_800, 1, tariff)).toEqual({
      base: 4_000,
      distance: 7_000,
      discount: 0,
      total: 11_000,
    });
    expect(quoteFare(2_800, 2, tariff)).toEqual({
      base: 4_000,
      distance: 7_000,
      discount: 1_400,
      total: 9_600,
    });

    // Shirin Banani → Gulshan 2 1.6 km
    expect(distanceCharge(1_600, tariff)).toBe(4_000);
    expect(quoteFare(1_600, 1, tariff)).toEqual({
      base: 4_000,
      distance: 4_000,
      discount: 0,
      total: 8_000,
    });
    expect(quoteFare(1_600, 2, tariff)).toEqual({
      base: 4_000,
      distance: 4_000,
      discount: 800,
      total: 7_200,
    });
  });

  it('applies zero discount for a single-rider pool', () => {
    const solo = quoteFare(2_500, 1, tariff);
    expect(solo.discount).toBe(0);
    expect(solo.total).toBe(10_250);
  });

  it('returns only integers', () => {
    for (const riders of [1, 2, 3]) {
      const q = quoteFare(2_500, riders, tariff);
      expect(Number.isInteger(q.base)).toBe(true);
      expect(Number.isInteger(q.distance)).toBe(true);
      expect(Number.isInteger(q.discount)).toBe(true);
      expect(Number.isInteger(q.total)).toBe(true);
    }
  });
});

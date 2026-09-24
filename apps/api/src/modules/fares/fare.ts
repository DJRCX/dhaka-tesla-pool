export type Tariff = {
  baseFarePaisa: number;
  perKmPaisa: number;
  poolDiscountPercent: number;
};

/** PRD / DESIGN defaults — config overrides these at runtime. */
export const DEFAULT_TARIFF: Tariff = {
  baseFarePaisa: 4_000,
  perKmPaisa: 2_500,
  poolDiscountPercent: 20,
};

export type FareBreakdown = {
  base: number;
  distance: number;
  discount: number;
  total: number;
};

/** Keeps the no-rounding property: distance charges stay multiples of 250 paisa. */
export function assertValidTariff(tariff: Tariff): void {
  if (!Number.isInteger(tariff.baseFarePaisa) || tariff.baseFarePaisa < 0) {
    throw new Error('baseFarePaisa must be a non-negative integer');
  }
  if (!Number.isInteger(tariff.perKmPaisa) || tariff.perKmPaisa <= 0 || tariff.perKmPaisa % 10 !== 0) {
    throw new Error('perKmPaisa must be a positive integer divisible by 10');
  }
  if (
    !Number.isInteger(tariff.poolDiscountPercent) ||
    tariff.poolDiscountPercent < 0 ||
    tariff.poolDiscountPercent > 50
  ) {
    throw new Error('poolDiscountPercent must be an integer between 0 and 50');
  }
}

export function distanceCharge(distanceM: number, tariff: Tariff = DEFAULT_TARIFF): number {
  return (distanceM * tariff.perKmPaisa) / 1_000;
}

/**
 * Quote a passenger fare. `activeRiders` counts memberships (assumption A5), not seats.
 * Discount applies only when activeRiders >= 2.
 */
export function quoteFare(
  distanceM: number,
  activeRiders: number,
  tariff: Tariff = DEFAULT_TARIFF,
): FareBreakdown {
  const base = tariff.baseFarePaisa;
  const distance = distanceCharge(distanceM, tariff);
  const discount =
    activeRiders >= 2 ? (distance * tariff.poolDiscountPercent) / 100 : 0;
  return { base, distance, discount, total: base + distance - discount };
}

export function tariffFromConfig(config: {
  FARE_BASE_PAISA: number;
  FARE_PER_KM_PAISA: number;
  FARE_POOL_DISCOUNT_PERCENT: number;
}): Tariff {
  const tariff: Tariff = {
    baseFarePaisa: config.FARE_BASE_PAISA,
    perKmPaisa: config.FARE_PER_KM_PAISA,
    poolDiscountPercent: config.FARE_POOL_DISCOUNT_PERCENT,
  };
  assertValidTariff(tariff);
  return tariff;
}

import type { PaymentMethod, RequestStatus } from '@teslapool/shared';

export type ZoneRef = {
  id: number;
  slug: string;
  name: string;
};

export type FareBreakdown = {
  basePaisa: number;
  distancePaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  isFinal: boolean;
};

export type RideEvent = {
  id: number;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
};

export type RidePoolInfo = {
  driverName: string;
  vehicleName: string;
  coRiderCount: number;
  status: string;
};

export type Ride = {
  id: string;
  status: RequestStatus;
  pickup: ZoneRef;
  dropoff: ZoneRef;
  seats: number;
  allowPool: boolean;
  paymentMethod: PaymentMethod;
  distanceM: number;
  soloFarePaisa: number;
  finalFarePaisa: number | null;
  fare: FareBreakdown;
  pool: RidePoolInfo | null;
  events: RideEvent[];
  createdAt: string;
};

export type FareQuote = {
  pickup: ZoneRef;
  dropoff: ZoneRef;
  distanceM: number;
  solo: Omit<FareBreakdown, 'isFinal'>;
  pooled: Omit<FareBreakdown, 'isFinal'>;
};

export type WalletTransaction = {
  id: string;
  type: string;
  amountPaisa: number;
  balanceAfterPaisa: number;
  rideRequestId: string | null;
  createdAt: string;
};

export type Wallet = {
  balancePaisa: number;
  transactions: WalletTransaction[];
};

export const CANCELABLE_STATUSES = new Set<RequestStatus>([
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVED',
]);

export const TERMINAL_STATUSES = new Set<RequestStatus>(['COMPLETED', 'CANCELLED']);

export function canCancelRide(status: RequestStatus): boolean {
  return CANCELABLE_STATUSES.has(status);
}

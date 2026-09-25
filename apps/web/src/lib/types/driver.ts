import type { PaymentMethod, PoolStatus, RequestStatus } from '@teslapool/shared';

export type DriverWaitingRequest = {
  id: string;
  passengerFirstName: string;
  seats: number;
  allowPool: boolean;
  estimatedFarePaisa: number;
  dropoff: { id: number; slug: string | null; name: string | null } | null;
  createdAt: string;
};

export type DriverPoolMember = {
  rideRequestId: string;
  passengerName: string;
  seats: number;
  paymentMethod: PaymentMethod;
  requestStatus: RequestStatus;
  dropoff: { id: number; slug: string | null; name: string | null } | null;
  fare: {
    basePaisa: number;
    distancePaisa: number;
    discountPaisa: number;
    totalPaisa: number;
  };
};

export type DriverPoolAction = 'arrive' | 'start' | 'complete' | 'cancel';

export type DriverActivePool = {
  id: string;
  status: PoolStatus;
  pickupZoneId: number;
  isShared: boolean;
  capacity: number;
  seatsTaken: number;
  seatsRemaining: number;
  vehicle: {
    id: string;
    name: string;
    plate: string;
    capacity: number;
  } | null;
  nextActions: DriverPoolAction[];
  members: DriverPoolMember[];
  createdAt: string;
};

export type PoolCandidate = {
  id: string;
  passengerFirstName: string;
  seats: number;
  allowPool: boolean;
  soloFarePaisa: number;
  dropoff: { id: number; slug: string | null; name: string | null } | null;
  compatible: boolean;
  reason: string | null;
  createdAt: string;
};

export type DriverPoolHistoryItem = {
  id: string;
  status: PoolStatus;
  seatsTaken: number;
  capacity: number;
  totalCollectedPaisa: number;
  createdAt: string;
  completedAt: string | null;
  pickup?: { id: number; slug: string; name: string } | null;
  members?: Array<{
    passengerName: string;
    seats: number;
    paymentMethod: PaymentMethod;
    dropoff: { id: number; slug: string | null; name: string | null } | null;
    farePaisa: number;
  }>;
};

export function cashMembers(members: DriverPoolMember[]): DriverPoolMember[] {
  return members.filter((member) => member.paymentMethod === 'CASH');
}

export function cashTotalPaisa(members: DriverPoolMember[]): number {
  return cashMembers(members).reduce((sum, member) => sum + member.fare.totalPaisa, 0);
}

export function primaryPoolAction(
  actions: DriverPoolAction[],
): Exclude<DriverPoolAction, 'cancel'> | null {
  const primary = actions.find((action) => action !== 'cancel');
  return (primary as Exclude<DriverPoolAction, 'cancel'> | undefined) ?? null;
}

export function poolActionLabel(action: DriverPoolAction): string {
  switch (action) {
    case 'arrive':
      return 'Arrived';
    case 'start':
      return 'Start trip';
    case 'complete':
      return 'Complete trip';
    case 'cancel':
      return 'Cancel pool';
    default:
      return action;
  }
}

export function candidateReasonLabel(
  reason: string | null,
  zonesBySlug: Map<string, string>,
): string {
  if (!reason) return '';
  if (reason === 'NOT_SHARED') return 'Rider is not pooling';
  if (reason === 'DIFFERENT_PICKUP') return 'Different pickup zone';
  if (reason === 'NO_SEATS') return 'Not enough seats';
  if (reason === 'NOT_JOINABLE') return 'Pool is not accepting riders';
  if (reason.startsWith('TOO_FAR:')) {
    const label = reason.slice('TOO_FAR:'.length);
    const name = zonesBySlug.get(label) ?? label;
    return `Too far from ${name}`;
  }
  return reason;
}

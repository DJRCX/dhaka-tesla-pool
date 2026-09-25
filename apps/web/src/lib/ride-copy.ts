import type { RequestStatus } from '@teslapool/shared';
import type { Ride } from '@/lib/types/ride';
import { formatTaka } from '@/lib/money';

const STEP_ORDER: RequestStatus[] = [
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
];

export function statusStepIndex(status: RequestStatus): number {
  if (status === 'CANCELLED') return -1;
  return STEP_ORDER.indexOf(status);
}

export function rideStatusSentence(ride: Ride): string {
  switch (ride.status) {
    case 'REQUESTED':
      return `Waiting for a Tesla in ${ride.pickup.name}`;
    case 'MATCHED':
      return ride.pool
        ? `${ride.pool.driverName} is on the way in ${ride.pool.vehicleName}`
        : 'Matched with a Tesla';
    case 'DRIVER_ARRIVED':
      return ride.pool
        ? `${ride.pool.driverName} has arrived in ${ride.pool.vehicleName}`
        : 'Your Tesla has arrived';
    case 'STARTED':
      return `Heading to ${ride.dropoff.name}`;
    case 'COMPLETED':
      return `Arrived at ${ride.dropoff.name}`;
    case 'CANCELLED':
      return 'Ride cancelled';
    default:
      return ride.status;
  }
}

export function sharingLabel(coRiderCount: number): string | null {
  if (coRiderCount <= 0) return null;
  if (coRiderCount === 1) return 'Sharing with 1 other rider';
  return `Sharing with ${coRiderCount} other riders`;
}

export function paymentLabel(method: Ride['paymentMethod']): string {
  return method === 'WALLET' ? 'TeslaPay' : 'Cash';
}

export function formatRideRoute(ride: Ride): string {
  return `${ride.pickup.name} → ${ride.dropoff.name}`;
}

export function formatRideWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function eventLabel(type: string, toStatus: string | null): string {
  if (type === 'REQUEST_CREATED') return 'Ride requested';
  if (type === 'FARE_RECALCULATED') return 'Fare updated';
  if (type === 'MEMBER_LEFT') return 'A rider left the pool';
  if (toStatus) {
    const labels: Record<string, string> = {
      REQUESTED: 'Back in the queue',
      MATCHED: 'Matched with a Tesla',
      DRIVER_ARRIVED: 'Driver arrived',
      STARTED: 'Trip started',
      COMPLETED: 'Trip completed',
      CANCELLED: 'Cancelled',
    };
    return labels[toStatus] ?? toStatus;
  }
  return type.replaceAll('_', ' ').toLowerCase();
}

export function fareDropToastMessage(totalPaisa: number): string {
  return `Someone joined your Tesla. Your fare dropped to ${formatTaka(totalPaisa)}.`;
}

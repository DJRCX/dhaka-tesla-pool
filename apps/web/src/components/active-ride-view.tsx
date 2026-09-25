'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FareBreakdownCard } from '@/components/fare-breakdown';
import { StatusStepper } from '@/components/status-stepper';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { formatTaka } from '@/lib/money';
import { useCancelRide, useRide } from '@/lib/queries/rides';
import {
  fareDropToastMessage,
  paymentLabel,
  rideStatusSentence,
  sharingLabel,
} from '@/lib/ride-copy';
import { canCancelRide } from '@/lib/types/ride';

export function ActiveRideView({ rideId }: { rideId: string }) {
  const rideQuery = useRide(rideId, { poll: true });
  const cancelRide = useCancelRide();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const lastFareRef = useRef<number | null>(null);
  const lastCoRidersRef = useRef<number | null>(null);

  const ride = rideQuery.data;

  useEffect(() => {
    if (!ride) return;
    const total = ride.fare.totalPaisa;
    const coRiders = ride.pool?.coRiderCount ?? 0;
    const prevFare = lastFareRef.current;
    const prevCo = lastCoRidersRef.current;

    if (
      prevFare !== null &&
      prevCo !== null &&
      coRiders > prevCo &&
      total < prevFare
    ) {
      toast.message(fareDropToastMessage(total));
    }

    lastFareRef.current = total;
    lastCoRidersRef.current = coRiders;
  }, [ride]);

  if (rideQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (rideQuery.isError || !ride) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load this ride</CardTitle>
          <CardDescription>
            {rideQuery.error instanceof ApiError
              ? rideQuery.error.message
              : 'Something went wrong.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void rideQuery.refetch()}>
            Retry
          </Button>
          <Button asChild variant="secondary">
            <Link href="/ride">Back</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (ride.status === 'COMPLETED') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Trip complete</h1>
          <p className="text-lg text-muted-foreground">{rideStatusSentence(ride)}</p>
        </div>
        <FareBreakdownCard fare={ride.fare} />
        <p className="text-sm text-muted-foreground">
          Paid with {paymentLabel(ride.paymentMethod)}. Final fare{' '}
          <span className="font-medium text-foreground">
            {formatTaka(ride.finalFarePaisa ?? ride.fare.totalPaisa)}
          </span>
          .
        </p>
        <Button asChild>
          <Link href="/ride">Book another ride</Link>
        </Button>
      </div>
    );
  }

  if (ride.status === 'CANCELLED') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Ride cancelled</h1>
          <p className="text-muted-foreground">
            {ride.pickup.name} → {ride.dropoff.name}
          </p>
        </div>
        <Button asChild>
          <Link href="/ride">Book another ride</Link>
        </Button>
      </div>
    );
  }

  const sharing = ride.pool ? sharingLabel(ride.pool.coRiderCount) : null;
  const showCancel = canCancelRide(ride.status);

  return (
    <div className="flex flex-col gap-6">
      <StatusStepper status={ride.status} />

      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {ride.pickup.name} → {ride.dropoff.name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {rideStatusSentence(ride)}
        </h1>
        {sharing && <p className="text-sm text-primary">{sharing}</p>}
      </div>

      <FareBreakdownCard fare={ride.fare} />

      <p className="text-sm text-muted-foreground">
        Paying with {paymentLabel(ride.paymentMethod)}
      </p>

      {actionError && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}

      {showCancel && (
        <Button type="button" variant="outline" onClick={() => setConfirmOpen(true)}>
          Cancel ride
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Cancel this ride?"
        description="Your Tesla request will be cancelled. If you were already matched, the seat frees up for someone else."
        confirmLabel="Cancel ride"
        destructive
        pending={cancelRide.isPending}
        onConfirm={() => {
          setActionError(null);
          void cancelRide
            .mutateAsync(ride.id)
            .then(() => setConfirmOpen(false))
            .catch((error: unknown) => {
              setConfirmOpen(false);
              if (error instanceof ApiError) {
                setActionError(error.message);
                return;
              }
              setActionError('Could not cancel. Try again.');
            });
        }}
      />
    </div>
  );
}

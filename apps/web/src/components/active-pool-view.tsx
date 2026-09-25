'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PoolMemberList } from '@/components/pool-member-list';
import { SeatMeter } from '@/components/seat-meter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { formatTaka } from '@/lib/money';
import {
  useAddPoolMember,
  useCurrentPool,
  usePoolAction,
  usePoolCandidates,
} from '@/lib/queries/driver';
import { useZones } from '@/lib/queries/zones';
import {
  candidateReasonLabel,
  cashMembers,
  cashTotalPaisa,
  poolActionLabel,
  primaryPoolAction,
  type DriverActivePool,
  type DriverPoolAction,
} from '@/lib/types/driver';
import { cn } from '@/lib/utils';

function CandidatesSection({ pool }: { pool: DriverActivePool }) {
  const candidates = usePoolCandidates(pool.id, { poll: true });
  const addMember = useAddPoolMember();
  const zones = useZones();
  const zonesBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const zone of zones.data ?? []) {
      map.set(zone.slug, zone.name);
    }
    return map;
  }, [zones.data]);

  if (candidates.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (!candidates.data?.length) {
    return <p className="text-sm text-muted-foreground">No other waiting riders nearby.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {candidates.data.map((candidate) => (
        <li
          key={candidate.id}
          className={cn(
            'flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm',
            !candidate.compatible && 'opacity-60',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {candidate.passengerFirstName} → {candidate.dropoff?.name ?? 'Unknown'}
            </span>
            <span className="tabular-nums">{formatTaka(candidate.soloFarePaisa)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">
              {candidate.seats} seat{candidate.seats === 1 ? '' : 's'}
              {!candidate.compatible && candidate.reason
                ? ` · ${candidateReasonLabel(candidate.reason, zonesBySlug)}`
                : ''}
            </span>
            {candidate.compatible ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={addMember.isPending || pool.seatsRemaining < candidate.seats}
                onClick={() => {
                  void addMember
                    .mutateAsync({ poolId: pool.id, rideRequestId: candidate.id })
                    .then(() => toast.success(`Added ${candidate.passengerFirstName}`))
                    .catch((error: unknown) => {
                      toast.error(
                        error instanceof ApiError ? error.message : 'Could not add rider',
                      );
                      void candidates.refetch();
                    });
                }}
              >
                Add
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ActivePoolView({ pool }: { pool: DriverActivePool }) {
  const poolAction = usePoolAction();
  const currentPool = useCurrentPool();
  const [confirmAction, setConfirmAction] = useState<DriverPoolAction | null>(null);

  const primary = primaryPoolAction(pool.nextActions);
  const canCancel = pool.nextActions.includes('cancel');
  const cashRiders = cashMembers(pool.members);
  const cashTotal = cashTotalPaisa(pool.members);
  const fareTotal = pool.members.reduce((sum, member) => sum + member.fare.totalPaisa, 0);

  function runAction(action: DriverPoolAction) {
    void poolAction
      .mutateAsync({ poolId: pool.id, action })
      .then(() => {
        setConfirmAction(null);
        if (action === 'complete') {
          toast.success('Trip completed');
        }
      })
      .catch((error: unknown) => {
        setConfirmAction(null);
        toast.error(error instanceof ApiError ? error.message : 'Action failed');
        void currentPool.refetch();
      });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-base">
            {pool.vehicle?.name ?? 'Tesla'} · {pool.status.replaceAll('_', ' ')}
          </CardTitle>
          <CardDescription>
            {pool.isShared ? 'Shared pool' : 'Solo trip'} · pickup zone #{pool.pickupZoneId}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SeatMeter seatsTaken={pool.seatsTaken} capacity={pool.capacity} />
          <PoolMemberList members={pool.members} />
          <div className="flex flex-col gap-1 border-t pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Total fares</span>
              <span className="font-medium tabular-nums">{formatTaka(fareTotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Cash to collect</span>
              <span className="font-medium tabular-nums">{formatTaka(cashTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Nearby candidates</h2>
        <CandidatesSection pool={pool} />
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        {primary ? (
          <Button
            type="button"
            className="sm:flex-1"
            disabled={poolAction.isPending}
            onClick={() => {
              if (primary === 'complete') {
                setConfirmAction('complete');
                return;
              }
              runAction(primary);
            }}
          >
            {poolAction.isPending && confirmAction !== 'cancel'
              ? 'Working…'
              : poolActionLabel(primary)}
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            type="button"
            variant="outline"
            className="sm:flex-1"
            disabled={poolAction.isPending}
            onClick={() => setConfirmAction('cancel')}
          >
            Cancel pool
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmAction === 'cancel'}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title="Cancel this pool?"
        description="Riders go back to the waiting queue in this zone."
        confirmLabel="Cancel pool"
        destructive
        pending={poolAction.isPending}
        onConfirm={() => runAction('cancel')}
      />

      <ConfirmDialog
        open={confirmAction === 'complete'}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title="Complete trip?"
        description={
          cashRiders.length === 0
            ? 'All riders paid with TeslaPay. Closing the pool will settle wallets.'
            : `Collect cash from ${cashRiders
                .map((rider) => `${rider.passengerName} (${formatTaka(rider.fare.totalPaisa)})`)
                .join(', ')}. Total cash ${formatTaka(cashTotal)}.`
        }
        confirmLabel="Complete trip"
        pending={poolAction.isPending}
        onConfirm={() => runAction('complete')}
      />
    </div>
  );
}

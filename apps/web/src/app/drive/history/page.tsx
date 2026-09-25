'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AuthedShell } from '@/components/authed-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTaka } from '@/lib/money';
import { useMe } from '@/lib/queries/auth';
import { useDriverPoolHistory } from '@/lib/queries/driver';
import { formatRideWhen, paymentLabel } from '@/lib/ride-copy';
import type { DriverPoolHistoryItem } from '@/lib/types/driver';

function statusVariant(
  status: DriverPoolHistoryItem['status'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'COMPLETED') return 'default';
  if (status === 'CANCELLED') return 'destructive';
  return 'secondary';
}

function PoolHistoryRow({ pool }: { pool: DriverPoolHistoryItem }) {
  const [open, setOpen] = useState(false);
  const riderCount = pool.members.filter((member) => member.status === 'ACTIVE').length ||
    pool.members.length;

  return (
    <Card>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {pool.pickup?.name ?? 'Pickup'} · {riderCount} rider
              {riderCount === 1 ? '' : 's'}
            </CardTitle>
            <Badge variant={statusVariant(pool.status)}>{pool.status}</Badge>
          </div>
          <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{formatRideWhen(pool.createdAt)}</span>
            <span className="font-medium text-foreground tabular-nums">
              {formatTaka(pool.totalCollectedPaisa)}
            </span>
          </CardDescription>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="flex flex-col gap-4 border-t pt-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Members</h3>
            <ul className="flex flex-col gap-2">
              {pool.members.map((member, index) => (
                <li
                  key={`${member.passengerName}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{member.passengerName}</span>
                    <span className="text-muted-foreground">
                      → {member.dropoff?.name ?? 'Unknown'} · {member.seats} seat
                      {member.seats === 1 ? '' : 's'} · {paymentLabel(member.paymentMethod)} ·{' '}
                      {member.status}
                    </span>
                  </div>
                  <span className="tabular-nums font-medium">{formatTaka(member.farePaisa)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Timeline</h3>
            <ol className="flex flex-col gap-2 text-sm">
              <li className="flex flex-col gap-0.5">
                <span className="font-medium">Pool created</span>
                <span className="text-muted-foreground">{formatRideWhen(pool.createdAt)}</span>
              </li>
              {pool.members.map((member, index) => (
                <li key={`join-${member.passengerName}-${index}`} className="flex flex-col gap-0.5">
                  <span className="font-medium">{member.passengerName} joined</span>
                  <span className="text-muted-foreground">{formatRideWhen(member.joinedAt)}</span>
                </li>
              ))}
              {pool.completedAt ? (
                <li className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {pool.status === 'CANCELLED' ? 'Pool cancelled' : 'Pool completed'}
                  </span>
                  <span className="text-muted-foreground">
                    {formatRideWhen(pool.completedAt)}
                  </span>
                </li>
              ) : null}
            </ol>
          </section>
        </CardContent>
      )}
    </Card>
  );
}

export default function DriveHistoryPage() {
  const me = useMe();
  const history = useDriverPoolHistory({ enabled: me.data?.user.role === 'DRIVER' });

  if (me.isLoading) {
    return (
      <AuthedShell>
        <Skeleton className="h-40 w-full" />
      </AuthedShell>
    );
  }

  if (me.data?.user.role !== 'DRIVER') {
    return (
      <AuthedShell>
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Pool history</h1>
          <p className="text-muted-foreground">Driver history uses a driver account.</p>
          <Button asChild variant="outline" className="w-fit">
            <Link href="/ride">Go to rides</Link>
          </Button>
        </div>
      </AuthedShell>
    );
  }

  const past =
    history.data?.filter(
      (pool) => pool.status === 'COMPLETED' || pool.status === 'CANCELLED',
    ) ?? [];

  return (
    <AuthedShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Pool history</h1>
            <p className="text-muted-foreground">Past Tesla pools and what you collected.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/drive">Back to console</Link>
          </Button>
        </div>

        {history.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : history.isError ? (
          <Card>
            <CardHeader>
              <CardTitle>Could not load history</CardTitle>
              <CardDescription>Retry when the API is reachable.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="outline" onClick={() => void history.refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : past.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No completed pools yet</CardTitle>
              <CardDescription>Accept a waiting rider to start your first pool.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/drive">Open console</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {past.map((pool) => (
              <PoolHistoryRow key={pool.id} pool={pool} />
            ))}
          </div>
        )}
      </div>
    </AuthedShell>
  );
}

'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTaka } from '@/lib/money';
import { useRideHistory } from '@/lib/queries/rides';
import {
  eventLabel,
  formatRideRoute,
  formatRideWhen,
  paymentLabel,
} from '@/lib/ride-copy';
import type { Ride } from '@/lib/types/ride';
import Link from 'next/link';

function statusBadgeVariant(status: Ride['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'COMPLETED') return 'default';
  if (status === 'CANCELLED') return 'destructive';
  return 'secondary';
}

function RideHistoryRow({ ride }: { ride: Ride }) {
  const [open, setOpen] = useState(false);
  const fare = ride.finalFarePaisa ?? ride.fare.totalPaisa;

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
            <CardTitle className="text-base">{formatRideRoute(ride)}</CardTitle>
            <Badge variant={statusBadgeVariant(ride.status)}>{ride.status}</Badge>
          </div>
          <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{formatRideWhen(ride.createdAt)}</span>
            <span>{paymentLabel(ride.paymentMethod)}</span>
            <span className="font-medium text-foreground tabular-nums">{formatTaka(fare)}</span>
          </CardDescription>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="flex flex-col gap-3 border-t pt-4">
          <ol className="flex flex-col gap-2">
            {ride.events.map((event) => (
              <li key={event.id} className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium">{eventLabel(event.type, event.toStatus)}</span>
                <span className="text-muted-foreground">{formatRideWhen(event.createdAt)}</span>
              </li>
            ))}
          </ol>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href={`/ride/${ride.id}`}>Open ride</Link>
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

export function RideHistoryList() {
  const history = useRideHistory();

  if (history.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (history.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load history</CardTitle>
          <CardDescription>Pull to retry when the API is back.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => void history.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!history.data?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No rides yet</CardTitle>
          <CardDescription>
            Your first Banani escape is one tap away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/ride">Request a ride</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {history.data.map((ride) => (
        <RideHistoryRow key={ride.id} ride={ride} />
      ))}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActivePoolView } from '@/components/active-pool-view';
import { AuthedShell } from '@/components/authed-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api';
import { formatTaka } from '@/lib/money';
import { useMe } from '@/lib/queries/auth';
import {
  useAcceptRequest,
  useCurrentPool,
  useDriverRequests,
  useSetDriverStatus,
} from '@/lib/queries/driver';
import { useZones } from '@/lib/queries/zones';

function DriverHeaderCard({ activePool }: { activePool: boolean }) {
  const me = useMe();
  const zones = useZones();
  const setStatus = useSetDriverStatus();
  const driver = me.data?.driver;
  const user = me.data?.user;
  const [pendingZoneId, setPendingZoneId] = useState<number | null>(null);

  const isOnline = driver?.isOnline ?? false;
  const currentZoneId = driver?.currentZone?.id ?? null;
  const zoneId = pendingZoneId ?? currentZoneId;
  const zoneName =
    driver?.currentZone?.name ??
    zones.data?.find((zone) => zone.id === zoneId)?.name ??
    'your zone';

  async function goOnline(nextZoneId: number) {
    try {
      await setStatus.mutateAsync({ isOnline: true, currentZoneId: nextZoneId });
      setPendingZoneId(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not go online');
    }
  }

  async function goOffline() {
    try {
      await setStatus.mutateAsync({ isOnline: false });
      setPendingZoneId(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not go offline');
      void me.refetch();
    }
  }

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{user?.name}</CardTitle>
            <CardDescription>
              {driver?.vehicle
                ? `${driver.vehicle.name} · ${driver.vehicle.plate} · ${driver.vehicle.capacity} seats`
                : 'No vehicle on file'}
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/drive/history">History</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Current zone</Label>
          <Select
            value={zoneId?.toString()}
            onValueChange={(value) => {
              if (value == null) return;
              const next = Number(value);
              setPendingZoneId(next);
              if (isOnline) {
                void goOnline(next);
              }
            }}
            disabled={activePool || setStatus.isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(zones.data ?? []).map((zone) => (
                  <SelectItem key={zone.id} value={String(zone.id)}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="online-switch">Online</Label>
            <p className="text-sm text-muted-foreground">
              {isOnline ? `Accepting riders in ${zoneName}` : 'Go online to see nearby requests'}
            </p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Switch
                    id="online-switch"
                    checked={isOnline}
                    disabled={activePool || setStatus.isPending || (!isOnline && zoneId == null)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        if (zoneId == null) {
                          toast.error('Choose a zone before going online');
                          return;
                        }
                        void goOnline(zoneId);
                        return;
                      }
                      void goOffline();
                    }}
                  />
                </span>
              </TooltipTrigger>
              {activePool ? (
                <TooltipContent>
                  Finish or cancel your active pool before going offline
                </TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

function WaitingRequestFeed({ zoneName }: { zoneName: string }) {
  const requests = useDriverRequests({ poll: true });
  const accept = useAcceptRequest();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (requests.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!requests.data?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Waiting for riders</CardTitle>
          <CardDescription>No riders waiting in {zoneName} right now.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Waiting requests</h2>
      {requests.data.map((request) => (
        <Card key={request.id}>
          <CardHeader className="gap-1">
            <CardTitle className="text-base">
              {request.passengerFirstName} → {request.dropoff?.name ?? 'Unknown'}
            </CardTitle>
            <CardDescription>
              {request.seats} seat{request.seats === 1 ? '' : 's'} ·{' '}
              {request.allowPool ? 'Happy to share' : 'Solo only'} ·{' '}
              {formatTaka(request.estimatedFarePaisa)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              disabled={accept.isPending}
              onClick={() => {
                setPendingId(request.id);
                void accept
                  .mutateAsync(request.id)
                  .then(() => toast.success(`Accepted ${request.passengerFirstName}`))
                  .catch((error: unknown) => {
                    toast.error(
                      error instanceof ApiError ? error.message : 'Could not accept request',
                    );
                    void requests.refetch();
                  })
                  .finally(() => setPendingId(null));
              }}
            >
              {pendingId === request.id && accept.isPending ? 'Accepting…' : 'Accept'}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DriverDashboard() {
  const me = useMe();
  const currentPool = useCurrentPool({
    enabled: me.data?.user.role === 'DRIVER',
    poll: true,
  });

  const driver = me.data?.driver;
  const isOnline = driver?.isOnline ?? false;
  const zoneName = driver?.currentZone?.name ?? 'your zone';
  const activePool = Boolean(currentPool.data);

  if (me.isLoading || currentPool.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Driver console</h1>
      </div>

      <DriverHeaderCard activePool={activePool} />

      {currentPool.data ? (
        <ActivePoolView pool={currentPool.data} />
      ) : !isOnline ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">You&apos;re offline</CardTitle>
            <CardDescription>Go online to see riders near you.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <WaitingRequestFeed zoneName={zoneName} />
      )}
    </div>
  );
}

export function DrivePageContent() {
  const me = useMe();
  const user = me.data?.user;

  if (me.isLoading) {
    return (
      <AuthedShell>
        <Skeleton className="h-40 w-full" />
      </AuthedShell>
    );
  }

  if (user?.role !== 'DRIVER') {
    return (
      <AuthedShell>
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="font-medium text-destructive">Drivers only</p>
          <p className="text-sm text-muted-foreground">
            This screen is for Tesla drivers. Switch to a passenger account to request a ride.
          </p>
          <Button asChild variant="outline" className="w-fit">
            <Link href="/ride">Go to ride request</Link>
          </Button>
        </div>
      </AuthedShell>
    );
  }

  return (
    <AuthedShell>
      <DriverDashboard />
    </AuthedShell>
  );
}

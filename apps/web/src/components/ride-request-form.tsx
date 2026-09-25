'use client';

import { Minus, Plus } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaymentMethod } from '@teslapool/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { ApiError, apiFetch } from '@/lib/api';
import { formatTaka } from '@/lib/money';
import { useCreateRide, useFareQuote, useWallet } from '@/lib/queries/rides';
import { useZones } from '@/lib/queries/zones';

type PaymentChoice = 'CASH' | 'WALLET';

export function RideRequestForm() {
  const router = useRouter();
  const zones = useZones();
  const wallet = useWallet();
  const createRide = useCreateRide();

  const [pickupZoneId, setPickupZoneId] = useState<number | null>(null);
  const [dropoffZoneId, setDropoffZoneId] = useState<number | null>(null);
  const [seats, setSeats] = useState(1);
  const [allowPool, setAllowPool] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentChoice>('WALLET');
  const [formError, setFormError] = useState<string | null>(null);
  const [insufficientPrompt, setInsufficientPrompt] = useState(false);

  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const pickupId = useId();
  const dropoffId = useId();
  const seatsId = useId();

  const quote = useFareQuote(pickupZoneId, dropoffZoneId);

  const dropoffOptions = useMemo(
    () => (zones.data ?? []).filter((zone) => zone.id !== pickupZoneId),
    [zones.data, pickupZoneId],
  );

  useEffect(() => {
    if (dropoffZoneId !== null && dropoffZoneId === pickupZoneId) {
      setDropoffZoneId(null);
    }
  }, [pickupZoneId, dropoffZoneId]);

  if (zones.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (zones.isError || !zones.data?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load zones</CardTitle>
          <CardDescription>Check that the API is reachable, then retry.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => void zones.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const balancePaisa = wallet.data?.balancePaisa ?? 0;
  const estimate =
    quote.data === undefined
      ? null
      : allowPool
        ? quote.data.pooled.totalPaisa
        : quote.data.solo.totalPaisa;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        setFormError(null);
        setInsufficientPrompt(false);

        if (pickupZoneId === null || dropoffZoneId === null) {
          setFormError('Choose a pickup and destination.');
          return;
        }
        if (pickupZoneId === dropoffZoneId) {
          setFormError('Pickup and destination must be different.');
          return;
        }

        void createRide
          .mutateAsync({
            pickupZoneId,
            dropoffZoneId,
            seats,
            allowPool,
            paymentMethod,
            idempotencyKey,
          })
          .then((result) => {
            router.replace(`/ride/${result.ride.id}`);
          })
          .catch(async (error: unknown) => {
            if (error instanceof ApiError && error.code === 'ACTIVE_RIDE_EXISTS') {
              try {
                const active = await apiFetch<{ rides: { id: string }[] }>(
                  '/api/v1/rides?status=active',
                );
                const existing = active.rides[0];
                if (existing) {
                  router.replace(`/ride/${existing.id}`);
                  return;
                }
              } catch {
                // fall through to message
              }
              setFormError(error.message);
              return;
            }
            if (error instanceof ApiError && error.code === 'INSUFFICIENT_BALANCE') {
              setInsufficientPrompt(true);
              setFormError(
                `Your TeslaPay balance is ${formatTaka(balancePaisa)}. Switch to cash?`,
              );
              return;
            }
            if (error instanceof ApiError) {
              setFormError(error.message);
              return;
            }
            setFormError('Could not request a ride. Try again.');
          });
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={pickupId}>Pickup</Label>
        <Select
          value={pickupZoneId?.toString() ?? ''}
          onValueChange={(value) => setPickupZoneId(Number(value))}
        >
          <SelectTrigger id={pickupId} className="w-full">
            <SelectValue placeholder="Where are you?" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {zones.data.map((zone) => (
                <SelectItem key={zone.id} value={String(zone.id)}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={dropoffId}>Destination</Label>
        <Select
          value={dropoffZoneId?.toString() ?? ''}
          onValueChange={(value) => setDropoffZoneId(Number(value))}
          disabled={pickupZoneId === null}
        >
          <SelectTrigger id={dropoffId} className="w-full">
            <SelectValue placeholder="Where to?" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {dropoffOptions.map((zone) => (
                <SelectItem key={zone.id} value={String(zone.id)}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label id={seatsId}>Seats</Label>
        <div className="flex items-center gap-3" role="group" aria-labelledby={seatsId}>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Fewer seats"
            disabled={seats <= 1}
            onClick={() => setSeats((value) => Math.max(1, value - 1))}
          >
            <Minus />
          </Button>
          <span className="min-w-8 text-center text-lg font-medium tabular-nums">{seats}</span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="More seats"
            disabled={seats >= 3}
            onClick={() => setSeats((value) => Math.min(3, value + 1))}
          >
            <Plus />
          </Button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="allow-pool">Share my ride</Label>
          <p className="text-sm text-muted-foreground">Save up to 20% on distance</p>
        </div>
        <Switch
          id="allow-pool"
          checked={allowPool}
          onCheckedChange={setAllowPool}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Payment</legend>
        <RadioGroup
          value={paymentMethod}
          onValueChange={(value) => {
            setPaymentMethod(value as PaymentChoice);
            setInsufficientPrompt(false);
          }}
          className="gap-3"
        >
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-data-[state=checked]:border-primary">
            <RadioGroupItem value={PaymentMethod.CASH} id="pay-cash" />
            <span className="text-sm">Cash</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-data-[state=checked]:border-primary">
            <RadioGroupItem value={PaymentMethod.WALLET} id="pay-wallet" />
            <span className="flex flex-col gap-0.5 text-sm">
              <span>TeslaPay</span>
              <span className="text-muted-foreground">
                {wallet.isLoading
                  ? 'Loading balance…'
                  : `Balance ${formatTaka(balancePaisa)}`}
              </span>
            </span>
          </label>
        </RadioGroup>
      </fieldset>

      {quote.isFetching && pickupZoneId && dropoffZoneId ? (
        <Skeleton className="h-28 w-full" />
      ) : quote.data ? (
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-base">Fare quote</CardTitle>
            <CardDescription>
              {quote.data.pickup.name} → {quote.data.dropoff.name} ·{' '}
              {(quote.data.distanceM / 1000).toFixed(1)} km
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Solo</span>
              <span className="font-medium tabular-nums">
                {formatTaka(quote.data.solo.totalPaisa)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Pooled</span>
              <span className="font-medium tabular-nums text-primary">
                {formatTaka(quote.data.pooled.totalPaisa)}
              </span>
            </div>
            <p className="pt-1 text-muted-foreground">
              You will be charged about{' '}
              <span className="font-medium text-foreground">
                {formatTaka(estimate ?? quote.data.solo.totalPaisa)}
              </span>{' '}
              {allowPool ? 'if someone shares' : 'for a solo ride'}.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {formError && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
          {insufficientPrompt && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                setPaymentMethod('CASH');
                setInsufficientPrompt(false);
                setFormError(null);
              }}
            >
              Switch to cash
            </Button>
          )}
        </div>
      )}

      <Button type="submit" disabled={createRide.isPending || !quote.data}>
        {createRide.isPending ? 'Requesting…' : 'Request Tesla'}
      </Button>
    </form>
  );
}

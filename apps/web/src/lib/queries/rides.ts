import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { FareQuote, Ride, Wallet } from '@/lib/types/ride';
import type { PaymentMethod } from '@teslapool/shared';

export const ridesKeys = {
  all: ['rides'] as const,
  active: ['rides', 'active'] as const,
  history: ['rides', 'history'] as const,
  detail: (id: string) => ['rides', 'detail', id] as const,
};

export const walletKey = ['wallet'] as const;

export function useActiveRides(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ridesKeys.active,
    queryFn: () => apiFetch<{ rides: Ride[] }>('/api/v1/rides?status=active'),
    select: (data) => data.rides,
    enabled: options?.enabled ?? true,
    refetchInterval: (query) => {
      const rides = query.state.data?.rides;
      if (!rides?.length) return false;
      return 3_000;
    },
  });
}

export function useRideHistory(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ridesKeys.history,
    queryFn: () => apiFetch<{ rides: Ride[] }>('/api/v1/rides?status=history'),
    select: (data) => data.rides,
    enabled: options?.enabled ?? true,
  });
}

export function useRide(id: string | undefined, options?: { poll?: boolean }) {
  return useQuery({
    queryKey: ridesKeys.detail(id ?? ''),
    queryFn: () => apiFetch<{ ride: Ride }>(`/api/v1/rides/${id}`),
    select: (data) => data.ride,
    enabled: Boolean(id),
    refetchInterval: (query) => {
      if (!options?.poll) return false;
      const status = query.state.data?.ride.status;
      if (!status || status === 'COMPLETED' || status === 'CANCELLED') return false;
      return 3_000;
    },
  });
}

export function useFareQuote(pickupZoneId: number | null, dropoffZoneId: number | null) {
  const ready =
    pickupZoneId !== null && dropoffZoneId !== null && pickupZoneId !== dropoffZoneId;
  return useQuery({
    queryKey: ['fares', 'quote', pickupZoneId, dropoffZoneId],
    queryFn: () =>
      apiFetch<FareQuote>(
        `/api/v1/fares/quote?pickup=${pickupZoneId}&dropoff=${dropoffZoneId}`,
      ),
    enabled: ready,
  });
}

export function useWallet(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: walletKey,
    queryFn: () => apiFetch<Wallet>('/api/v1/wallet'),
    enabled: options?.enabled ?? true,
  });
}

export type CreateRideInput = {
  pickupZoneId: number;
  dropoffZoneId: number;
  seats: number;
  allowPool: boolean;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
};

export function useCreateRide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRideInput) =>
      apiFetch<{ ride: Ride }>('/api/v1/rides', {
        method: 'POST',
        headers: { 'Idempotency-Key': input.idempotencyKey },
        body: JSON.stringify({
          pickupZoneId: input.pickupZoneId,
          dropoffZoneId: input.dropoffZoneId,
          seats: input.seats,
          allowPool: input.allowPool,
          paymentMethod: input.paymentMethod,
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(ridesKeys.detail(data.ride.id), { ride: data.ride });
      void queryClient.invalidateQueries({ queryKey: ridesKeys.active });
      void queryClient.invalidateQueries({ queryKey: walletKey });
    },
  });
}

export function useCancelRide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rideId: string) =>
      apiFetch<{ ride: Ride }>(`/api/v1/rides/${rideId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(ridesKeys.detail(data.ride.id), { ride: data.ride });
      void queryClient.invalidateQueries({ queryKey: ridesKeys.active });
      void queryClient.invalidateQueries({ queryKey: ridesKeys.history });
    },
  });
}

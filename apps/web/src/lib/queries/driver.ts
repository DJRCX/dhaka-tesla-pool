import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { meQueryKey } from '@/lib/queries/auth';
import type {
  DriverActivePool,
  DriverPoolAction,
  DriverPoolHistoryItem,
  DriverWaitingRequest,
  PoolCandidate,
} from '@/lib/types/driver';

export const driverKeys = {
  requests: ['driver', 'requests'] as const,
  currentPool: ['driver', 'pools', 'current'] as const,
  history: ['driver', 'pools', 'history'] as const,
  candidates: (poolId: string) => ['driver', 'pools', poolId, 'candidates'] as const,
};

export function useDriverRequests(options?: { enabled?: boolean; poll?: boolean }) {
  return useQuery({
    queryKey: driverKeys.requests,
    queryFn: () => apiFetch<{ requests: DriverWaitingRequest[] }>('/api/v1/driver/requests'),
    select: (data) => data.requests,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.poll ? 3_000 : false,
  });
}

export function useCurrentPool(options?: { enabled?: boolean; poll?: boolean }) {
  return useQuery({
    queryKey: driverKeys.currentPool,
    queryFn: () => apiFetch<{ pool: DriverActivePool | null }>('/api/v1/driver/pools/current'),
    select: (data) => data.pool,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.poll ? 3_000 : false,
  });
}

export function usePoolCandidates(poolId: string | undefined, options?: { poll?: boolean }) {
  return useQuery({
    queryKey: driverKeys.candidates(poolId ?? ''),
    queryFn: () =>
      apiFetch<{ candidates: PoolCandidate[] }>(`/api/v1/pools/${poolId}/candidates`),
    select: (data) => data.candidates,
    enabled: Boolean(poolId),
    refetchInterval: options?.poll ? 3_000 : false,
  });
}

export function useDriverPoolHistory(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: driverKeys.history,
    queryFn: () => apiFetch<{ pools: DriverPoolHistoryItem[] }>('/api/v1/driver/pools'),
    select: (data) => data.pools,
    enabled: options?.enabled ?? true,
  });
}

export function useSetDriverStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { isOnline: boolean; currentZoneId?: number }) =>
      apiFetch<{ isOnline: boolean; currentZoneId: number | null }>('/api/v1/driver/status', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      await queryClient.invalidateQueries({ queryKey: driverKeys.requests });
      await queryClient.invalidateQueries({ queryKey: driverKeys.currentPool });
    },
  });
}

export function useAcceptRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rideRequestId: string) =>
      apiFetch<{ poolId: string }>(`/api/v1/driver/requests/${rideRequestId}/accept`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: driverKeys.requests });
      await queryClient.invalidateQueries({ queryKey: driverKeys.currentPool });
    },
  });
}

export function useAddPoolMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { poolId: string; rideRequestId: string }) =>
      apiFetch<{ ok: true }>(`/api/v1/pools/${input.poolId}/members`, {
        method: 'POST',
        body: JSON.stringify({ rideRequestId: input.rideRequestId }),
      }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: driverKeys.currentPool });
      await queryClient.invalidateQueries({
        queryKey: driverKeys.candidates(variables.poolId),
      });
      await queryClient.invalidateQueries({ queryKey: driverKeys.requests });
    },
  });
}

export function usePoolAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { poolId: string; action: DriverPoolAction }) =>
      apiFetch<{ ok: true }>(`/api/v1/pools/${input.poolId}/${input.action}`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: driverKeys.currentPool });
      await queryClient.invalidateQueries({ queryKey: driverKeys.requests });
      await queryClient.invalidateQueries({ queryKey: driverKeys.history });
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

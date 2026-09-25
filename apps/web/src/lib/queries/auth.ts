import type { UserRole } from '@teslapool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
};

export type MeResponse = {
  user: AuthUser;
  driver?: {
    isOnline: boolean;
    currentZone: { id: number; slug: string | null; name: string | null } | null;
    vehicle: { id: string; name: string; plate: string; capacity: number } | null;
  };
};

export const meQueryKey = ['auth', 'me'] as const;

export function useMe(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: () => apiFetch<MeResponse>('/api/v1/auth/me'),
    retry: false,
    enabled: options?.enabled ?? true,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      apiFetch<{ user: AuthUser }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(meQueryKey, { user: data.user } satisfies MeResponse);
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; email: string; phone: string; password: string }) =>
      apiFetch<{ user: AuthUser }>('/api/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(meQueryKey, { user: data.user } satisfies MeResponse);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<void>('/api/v1/auth/logout', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.setQueryData(meQueryKey, null);
      queryClient.removeQueries({ queryKey: meQueryKey });
    },
  });
}

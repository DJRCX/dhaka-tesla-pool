import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type Zone = {
  id: number;
  slug: string;
  name: string;
  lat: string;
  lng: string;
};

type ZonesResponse = {
  zones: Zone[];
};

export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    queryFn: () => apiFetch<ZonesResponse>('/api/v1/zones'),
    select: (data) => data.zones,
  });
}

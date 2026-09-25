'use client';

import { use } from 'react';
import { AuthedShell } from '@/components/authed-shell';
import { ActiveRideView } from '@/components/active-ride-view';

export default function RideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <AuthedShell>
      <ActiveRideView rideId={id} />
    </AuthedShell>
  );
}

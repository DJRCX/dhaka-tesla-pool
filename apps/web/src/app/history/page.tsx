'use client';

import { AuthedShell } from '@/components/authed-shell';
import { RideHistoryList } from '@/components/ride-history-list';
import { useMe } from '@/lib/queries/auth';

export default function HistoryPage() {
  const me = useMe();

  if (me.data?.user.role === 'DRIVER') {
    return (
      <AuthedShell>
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Ride history</h1>
          <p className="text-muted-foreground">Passenger trip history uses a passenger account.</p>
        </div>
      </AuthedShell>
    );
  }

  return (
    <AuthedShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Ride history</h1>
          <p className="text-muted-foreground">Past trips with fare and timeline.</p>
        </div>
        <RideHistoryList />
      </div>
    </AuthedShell>
  );
}

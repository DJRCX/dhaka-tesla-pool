'use client';

import { AuthedShell } from '@/components/authed-shell';

export default function HistoryPage() {
  return (
    <AuthedShell>
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Ride history</h1>
        <p className="text-muted-foreground">Your completed trips will show up here.</p>
      </div>
    </AuthedShell>
  );
}

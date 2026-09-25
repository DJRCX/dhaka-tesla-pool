'use client';

import { AuthedShell } from '@/components/authed-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/queries/auth';

export default function RidePage() {
  const me = useMe();

  return (
    <AuthedShell>
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Request a ride</h1>
        {me.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <p className="text-muted-foreground">
            Hi {me.data?.user.name ?? 'there'}. The passenger ride form ships in the next phase.
          </p>
        )}
      </div>
    </AuthedShell>
  );
}

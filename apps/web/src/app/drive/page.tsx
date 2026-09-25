'use client';

import Link from 'next/link';
import { AuthedShell } from '@/components/authed-shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/queries/auth';

export default function DrivePage() {
  const me = useMe();
  const user = me.data?.user;

  return (
    <AuthedShell>
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Driver console</h1>
        {me.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : user?.role !== 'DRIVER' ? (
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="font-medium text-destructive">Drivers only</p>
            <p className="text-sm text-muted-foreground">
              This screen is for Tesla drivers. Switch to a passenger account to request a ride.
            </p>
            <Button asChild variant="outline" className="w-fit">
              <Link href="/ride">Go to ride request</Link>
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Welcome back, {user.name}. Go online and accept pools in the next phase.
          </p>
        )}
      </div>
    </AuthedShell>
  );
}

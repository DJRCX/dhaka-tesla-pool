'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthedShell } from '@/components/authed-shell';
import { RideRequestForm } from '@/components/ride-request-form';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/queries/auth';
import { useActiveRides } from '@/lib/queries/rides';

export default function RidePage() {
  const router = useRouter();
  const me = useMe();
  const active = useActiveRides({ enabled: me.data?.user.role === 'PASSENGER' });

  useEffect(() => {
    const ride = active.data?.[0];
    if (ride) {
      router.replace(`/ride/${ride.id}`);
    }
  }, [active.data, router]);

  if (me.data?.user.role === 'DRIVER') {
    return (
      <AuthedShell>
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Passenger rides</h1>
          <p className="text-muted-foreground">
            Drivers request rides from the passenger side with a passenger account.
          </p>
        </div>
      </AuthedShell>
    );
  }

  if (active.isLoading || (active.data && active.data.length > 0)) {
    return (
      <AuthedShell>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </AuthedShell>
    );
  }

  return (
    <AuthedShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Request a ride</h1>
          <p className="text-muted-foreground">
            Pick two zones, share a seat if you can, and we will find a Tesla.
          </p>
        </div>
        <RideRequestForm />
      </div>
    </AuthedShell>
  );
}

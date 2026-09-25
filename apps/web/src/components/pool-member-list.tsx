'use client';

import { Badge } from '@/components/ui/badge';
import { formatTaka } from '@/lib/money';
import { paymentLabel } from '@/lib/ride-copy';
import type { DriverPoolMember } from '@/lib/types/driver';

export function PoolMemberList({ members }: { members: DriverPoolMember[] }) {
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">No riders in this pool yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => (
        <li
          key={member.rideRequestId}
          className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{member.passengerName}</span>
            <Badge variant="secondary">{paymentLabel(member.paymentMethod)}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
            <span>→ {member.dropoff?.name ?? 'Unknown'}</span>
            <span>
              {member.seats} seat{member.seats === 1 ? '' : 's'}
            </span>
            <span className="tabular-nums text-foreground font-medium">
              {formatTaka(member.fare.totalPaisa)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

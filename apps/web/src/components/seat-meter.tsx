'use client';

import { cn } from '@/lib/utils';

export function SeatMeter({
  seatsTaken,
  capacity,
}: {
  seatsTaken: number;
  capacity: number;
}) {
  return (
    <div className="flex flex-col gap-2" aria-label={`${seatsTaken} of ${capacity} seats taken`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Seats</span>
        <span className="text-2xl font-semibold tabular-nums">
          {seatsTaken} <span className="text-base text-muted-foreground">/ {capacity}</span>
        </span>
      </div>
      <div className="flex gap-1.5" role="presentation">
        {Array.from({ length: capacity }, (_, index) => (
          <div
            key={index}
            className={cn(
              'h-2.5 flex-1 rounded-full',
              index < seatsTaken ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
    </div>
  );
}

'use client';

import type { RequestStatus } from '@teslapool/shared';
import { cn } from '@/lib/utils';
import { statusStepIndex } from '@/lib/ride-copy';

const STEPS: { key: RequestStatus; label: string }[] = [
  { key: 'REQUESTED', label: 'Requested' },
  { key: 'MATCHED', label: 'Matched' },
  { key: 'DRIVER_ARRIVED', label: 'Arrived' },
  { key: 'STARTED', label: 'En route' },
  { key: 'COMPLETED', label: 'Done' },
];

export function StatusStepper({ status }: { status: RequestStatus }) {
  if (status === 'CANCELLED') {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        Cancelled
      </p>
    );
  }

  const activeIndex = statusStepIndex(status);

  return (
    <ol className="flex flex-wrap gap-2" aria-label="Ride progress">
      {STEPS.map((step, index) => {
        const done = index <= activeIndex;
        const current = index === activeIndex;
        return (
          <li
            key={step.key}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium',
              done
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground',
              current && 'ring-2 ring-primary/30',
            )}
            aria-current={current ? 'step' : undefined}
          >
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

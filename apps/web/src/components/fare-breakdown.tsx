'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTaka } from '@/lib/money';
import type { FareBreakdown } from '@/lib/types/ride';

export function FareBreakdownCard({ fare }: { fare: FareBreakdown }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Fare</CardTitle>
        <Badge variant={fare.isFinal ? 'default' : 'secondary'}>
          {fare.isFinal ? 'Final' : 'Estimate'}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Base</span>
          <span className="tabular-nums">{formatTaka(fare.basePaisa)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Distance</span>
          <span className="tabular-nums">{formatTaka(fare.distancePaisa)}</span>
        </div>
        {fare.discountPaisa > 0 && (
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Pool discount</span>
            <span className="tabular-nums text-primary">
              −{formatTaka(fare.discountPaisa)}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-3 border-t pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatTaka(fare.totalPaisa)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import Link from 'next/link';
import { AuthedShell } from '@/components/authed-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTaka } from '@/lib/money';
import { useMe } from '@/lib/queries/auth';
import { useWallet } from '@/lib/queries/rides';
import { formatRideWhen } from '@/lib/ride-copy';

export default function WalletPage() {
  const me = useMe();
  const wallet = useWallet({ enabled: me.data?.user.role === 'PASSENGER' });

  if (me.data?.user.role === 'DRIVER') {
    return (
      <AuthedShell>
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">TeslaPay</h1>
          <p className="text-muted-foreground">Wallets belong to passenger accounts.</p>
        </div>
      </AuthedShell>
    );
  }

  return (
    <AuthedShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">TeslaPay</h1>
          <p className="text-muted-foreground">Simulated balance for demo rides.</p>
        </div>

        {wallet.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : wallet.isError || !wallet.data ? (
          <Card>
            <CardHeader>
              <CardTitle>Could not load wallet</CardTitle>
              <CardDescription>Retry when the API is reachable.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="outline" onClick={() => void wallet.refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardDescription>Available balance</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {formatTaka(wallet.data.balancePaisa)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm">
                  <Link href="/ride">Use on a ride</Link>
                </Button>
              </CardContent>
            </Card>

            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Recent activity</h2>
              {wallet.data.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {wallet.data.transactions.map((tx) => (
                    <li
                      key={tx.id}
                      className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{tx.type.replaceAll('_', ' ')}</span>
                        <span className="text-muted-foreground">
                          {formatRideWhen(tx.createdAt)}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="tabular-nums font-medium">
                          {formatTaka(tx.amountPaisa)}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          bal {formatTaka(tx.balanceAfterPaisa)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </AuthedShell>
  );
}

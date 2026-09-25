'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/demo-accounts';
import { homePathForRole, useLogin } from '@/lib/queries/auth';
import { ApiError } from '@/lib/api';
import { useState } from 'react';

export default function HomePage() {
  const router = useRouter();
  const login = useLogin();
  const [error, setError] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Share a seat across Dhaka</h1>
          <p className="max-w-xl text-muted-foreground leading-relaxed">
            Pool empty Tesla seats, split the fare, and skip the rush-hour slog. One origin for the
            app and API keeps your session cookie first-party.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/signup">Create account</Link>
            </Button>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Try the demo cast</h2>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Card key={account.email}>
                <CardHeader className="gap-1">
                  <CardTitle className="text-base">{account.name}</CardTitle>
                  <CardDescription>{account.blurb}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    type="button"
                    className="w-full"
                    variant="secondary"
                    disabled={login.isPending}
                    onClick={() => {
                      setError(null);
                      void login
                        .mutateAsync({ email: account.email, password: DEMO_PASSWORD })
                        .then((result) => {
                          router.replace(homePathForRole(result.user.role));
                        })
                        .catch((err: unknown) => {
                          if (err instanceof ApiError) {
                            setError(err.message);
                            return;
                          }
                          setError('Could not sign in. Is the API running?');
                        });
                    }}
                  >
                    Continue as {account.name}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LoginBodySchema } from '@teslapool/shared';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/demo-accounts';
import { homePathForRole, useLogin } from '@/lib/queries/auth';

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(nextEmail: string, nextPassword: string) {
    setFieldError(null);
    setServerError(null);
    const parsed = LoginBodySchema.safeParse({ email: nextEmail, password: nextPassword });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Invalid details');
      return;
    }

    try {
      const result = await login.mutateAsync(parsed.data);
      router.replace(homePathForRole(result.user.role));
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.message);
        return;
      }
      setServerError('Could not sign in. Try again.');
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your Tesla Pool account or a demo cast member below.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(email, password);
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(fieldError)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(fieldError)}
                  required
                />
              </div>
              {(fieldError || serverError) && (
                <p className="text-sm text-destructive" role="alert">
                  {fieldError ?? serverError}
                </p>
              )}
              <Button type="submit" disabled={login.isPending}>
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <p className="mt-4 text-sm text-muted-foreground">
              New here?{' '}
              <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
                Create an account
              </Link>
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Demo cast</h2>
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
                    variant="outline"
                    className="w-full"
                    disabled={login.isPending}
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(DEMO_PASSWORD);
                      void submit(account.email, DEMO_PASSWORD);
                    }}
                  >
                    Sign in as {account.name}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

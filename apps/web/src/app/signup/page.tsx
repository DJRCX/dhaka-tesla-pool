'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SignupBodySchema } from '@teslapool/shared';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { homePathForRole, useSignup } from '@/lib/queries/auth';

export default function SignupPage() {
  const router = useRouter();
  const signup = useSignup();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Create account</CardTitle>
            <CardDescription>
              Passengers start with ৳200.00 TeslaPay. Drivers are seeded for the demo cast.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                setFieldError(null);
                setServerError(null);
                const parsed = SignupBodySchema.safeParse({ name, email, phone, password });
                if (!parsed.success) {
                  setFieldError(parsed.error.issues[0]?.message ?? 'Invalid details');
                  return;
                }
                void signup
                  .mutateAsync(parsed.data)
                  .then((result) => {
                    router.replace(homePathForRole(result.user.role));
                  })
                  .catch((error: unknown) => {
                    if (error instanceof ApiError) {
                      setServerError(error.message);
                      return;
                    }
                    setServerError('Could not create your account. Try again.');
                  });
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {(fieldError || serverError) && (
                <p className="text-sm text-destructive" role="alert">
                  {fieldError ?? serverError}
                </p>
              )}
              <Button type="submit" disabled={signup.isPending}>
                {signup.isPending ? 'Creating…' : 'Sign up'}
              </Button>
            </form>
            <p className="mt-4 text-sm text-muted-foreground">
              Already riding?{' '}
              <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

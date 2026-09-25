'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export type AppShellUser = {
  name: string;
  role: 'PASSENGER' | 'DRIVER';
};

type AppShellProps = {
  children: React.ReactNode;
  user?: AppShellUser | null;
  onSignOut?: () => void;
};

export function AppShell({ children, user = null, onSignOut }: AppShellProps) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <Link href="/" className="font-heading text-base font-semibold tracking-tight text-foreground">
            Dhaka Tesla Pool
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}</span>
                <Badge variant="secondary">{user.role === 'DRIVER' ? 'Driver' : 'Passenger'}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onSignOut}
                  aria-label="Sign out"
                >
                  <LogOut data-icon="inline-start" />
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              </>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
        <Separator />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

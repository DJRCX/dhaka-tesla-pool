'use client';

import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { useLogout, useMe } from '@/lib/queries/auth';

export function AuthedShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  const user = me.data?.user
    ? { name: me.data.user.name, role: me.data.user.role }
    : null;

  return (
    <AppShell
      user={user}
      onSignOut={() => {
        logout.mutate(undefined, {
          onSuccess: () => {
            router.replace('/login');
          },
        });
      }}
    >
      {children}
    </AppShell>
  );
}

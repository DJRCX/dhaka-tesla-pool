import { AppShell } from '@/components/app-shell';

export default function HomePage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Share a seat across Dhaka</h1>
        <p className="text-muted-foreground leading-relaxed">
          Pool empty Tesla seats, split the fare, and skip the rush-hour slog. Sign in to request a
          ride or go online as a driver.
        </p>
      </div>
    </AppShell>
  );
}

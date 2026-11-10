'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect, useState } from 'react';
import { isSettingsPath } from '@/features/settings/nav';
import { setWorkspaceTimeZone, useWorkspaceTimeZone } from '@/lib/datetime';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { GuardProvider } from '@/features/settings/components/guard';
import { OrderDrawer } from '@/features/dashboard/components/order-drawer';
import { Toaster } from '@/components/ui/toaster';
import { ShellProvider } from './shell-context';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/** Publishes the workspace's time zone to the shared date formatter (and clears it on sign-out). */
function TimeZoneSync() {
  const { workspace } = useWorkspace();
  const zone = workspace?.reportingTimeZone ?? null;
  useLayoutEffect(() => {
    setWorkspaceTimeZone(zone);
  }, [zone]);
  return null;
}

/** Application chrome: glass top bar, collapsible sidebar, scrollable main region. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // A different workspace zone remounts the page so every date on it is formatted in the new zone. General settings
  // shows no dates and is where the zone is changed, so it keeps its form state (and its "Saved" confirmation).
  const keepState = pathname === '/settings/general';
  // Arriving in Settings from elsewhere slides the content in with the menu; moving between Settings pages only fades.
  const zone = useWorkspaceTimeZone();
  const [seen, setSeen] = useState(pathname);
  const [enteringSettings, setEntering] = useState(false);
  if (seen !== pathname) {
    setSeen(pathname);
    setEntering(isSettingsPath(pathname) && !isSettingsPath(seen));
  }
  return (
    <ShellProvider>
      <GuardProvider>
        <div className="relative flex h-screen flex-col overflow-hidden bg-canvas text-sm text-ink">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2"
          >
            Skip to content
          </a>
          <TopBar />
          <div className="relative flex min-h-0 flex-1">
            <Sidebar />
            {/* Keyed by route: each page fades in on navigation (shell stays put); query-string changes don't replay it. */}
            <main
              key={keepState ? pathname : `${pathname}|${zone ?? ''}`}
              id="main"
              className={cn(
                'min-w-0 flex-1 overflow-y-auto overflow-x-hidden',
                enteringSettings ? 'animate-settings-in' : 'animate-page-in',
              )}
            >
              {children}
            </main>
          </div>
          <OrderDrawer />
          <Toaster />
          <TimeZoneSync />
        </div>
      </GuardProvider>
    </ShellProvider>
  );
}

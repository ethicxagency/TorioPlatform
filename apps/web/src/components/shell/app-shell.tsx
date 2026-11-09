'use client';

import { usePathname } from 'next/navigation';
import { GuardProvider } from '@/features/settings/components/guard';
import { OrderDrawer } from '@/features/dashboard/components/order-drawer';
import { ShellProvider, useShell } from './shell-context';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

function Toast() {
  const { toastText } = useShell();
  if (!toastText) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-[95] flex max-w-[calc(100vw-32px)] -translate-x-1/2 animate-toast-in items-center gap-3 rounded-xl bg-ink px-3.5 py-2.5 text-[13px] text-white shadow-[0_8px_24px_rgba(0,55,112,0.2)]"
    >
      {toastText}
    </div>
  );
}

/** Application chrome: glass top bar, collapsible sidebar, scrollable main region. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
              key={pathname}
              id="main"
              className="min-w-0 flex-1 animate-page-in overflow-y-auto overflow-x-hidden"
            >
              {children}
            </main>
          </div>
          <OrderDrawer />
          <Toast />
        </div>
      </GuardProvider>
    </ShellProvider>
  );
}

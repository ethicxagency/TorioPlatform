'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { GlobalSearch } from '@/features/inbox/components/global-search';
import { clearStoredDrafts } from '@/features/inbox/use-drafts';
import { useAuth } from '@/lib/auth';
import { useShell } from './shell-context';
import { TorioLogo } from './torio-logo';

const glassBtn =
  'flex h-9 w-9 items-center justify-center rounded-[9px] border-none bg-transparent cursor-pointer hover:bg-white/75';

export function TopBar() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const initials = (user?.name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const { mobile, setMobileNav, mobileNav, toast, registerEscape } = useShell();
  const [accountOpen, setAccountOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const off = registerEscape(() => setAccountOpen(false));
    return () => {
      window.removeEventListener('keydown', onKey);
      off();
    };
  }, [registerEscape]);

  const stub = () => toast("This action isn't available yet");

  return (
    <header className="relative z-40 h-14 shrink-0 border-b border-[rgba(229,231,235,0.7)] bg-[linear-gradient(90deg,rgba(91,92,226,0.10),rgba(255,255,255,0.72)_45%,rgba(91,92,226,0.04))] backdrop-blur-[20px] backdrop-saturate-150">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-[60px] h-[180px] w-[180px] rounded-full bg-[#7C83FF] opacity-[0.14] blur-[40px]"
      />
      <div className="relative z-[1] flex h-full items-center gap-3 px-4">
        {mobile && (
          <button
            type="button"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="Open navigation"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] border-none bg-transparent"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#62656D"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        )}
        <TorioLogo className="block h-10 w-auto" />
        <div className="flex-1" />
        {!mobile && <GlobalSearch inputRef={inputRef} />}
        <div className="flex-1" />
        <button type="button" onClick={stub} aria-label="Help" title="Help" className={glassBtn}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#62656D"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.2a2.6 2.6 0 0 1 5 .8c0 1.7-2.5 2.3-2.5 3.6M12 17h.01" />
          </svg>
        </button>
        <button
          type="button"
          onClick={stub}
          aria-label="Notifications"
          className={`relative ${glassBtn}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#62656D"
            strokeWidth="1.75"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
          </svg>
          <span className="absolute right-2 top-[7px] h-[7px] w-[7px] rounded-full border-[1.5px] border-white bg-primary" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAccountOpen((v) => !v)}
            aria-label="Account menu"
            className="flex h-10 cursor-pointer items-center gap-2 rounded-[11px] border border-white/70 bg-white/50 py-1 pl-[5px] pr-2.5"
          >
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary text-[11.5px] font-semibold text-white">
              {initials}
            </span>
            {!mobile && <span className="text-[13.5px] font-semibold text-ink">Torio</span>}
          </button>
          {accountOpen && (
            <div className="absolute right-0 top-12 z-50 w-60 animate-panel-in rounded-[14px] border border-line bg-white/95 p-1.5 shadow-[0_8px_24px_rgba(16,24,40,0.1)] backdrop-blur-[20px]">
              <div className="mb-1 border-b border-line-subtle px-2.5 pb-2.5 pt-2">
                <div className="text-[13.5px] font-semibold">{user?.name}</div>
                <div className="truncate text-xs text-faint">{user?.email}</div>
              </div>
              {[
                { label: 'Profile', href: '/settings/profile' },
                { label: 'Workspace settings', href: '/settings/workspace' },
              ].map((l) => (
                <button
                  key={l.label}
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    router.push(l.href);
                  }}
                  className="block w-full cursor-pointer rounded-lg px-2.5 py-[9px] text-left text-[13.5px] hover:bg-wash"
                >
                  {l.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  clearStoredDrafts();
                  void signOut();
                }}
                className="block w-full cursor-pointer rounded-lg px-2.5 py-[9px] text-left text-[13.5px] hover:bg-wash"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

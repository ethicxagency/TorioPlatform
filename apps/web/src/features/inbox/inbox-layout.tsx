'use client';

import { useEffect } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { cn } from '@/lib/utils';
import { CHAT_MIN_WIDTH, LIST_WIDTH, PROFILE_WIDTH } from './constants';
import { usePanelWidth } from './use-panel-width';
import { ResizeHandle } from './components/resize-handle';

interface Props {
  list: React.ReactNode;
  chat: React.ReactNode | null;
  profile: React.ReactNode | null;
  /** Called when the profile must render as a drawer instead of inline. */
  onProfileDismiss: () => void;
}

/**
 * Responsive panel layout: List → Chat → Profile.
 *  - ≥ list+chat(420)+profile: three inline panels, list and profile resizable.
 *  - narrower: profile becomes a drawer; tablet shrinks the list; mobile shows one pane at a time.
 *  - chat closed: the list takes the full width (the stored list width is untouched).
 */
export function InboxLayout({ list, chat, profile, onProfileDismiss }: Props) {
  const { vw, mobile, contentWidth } = useShell();
  const listPanel = usePanelWidth({
    storageKey: 'torio-inbox-conversation-width',
    ...LIST_WIDTH,
    initial: LIST_WIDTH.default,
    direction: 1,
  });
  const profilePanel = usePanelWidth({
    storageKey: 'torio-inbox-profile-width',
    ...PROFILE_WIDTH,
    initial: PROFILE_WIDTH.default,
    direction: -1,
  });

  const chatOpen = chat !== null;
  const profileOpen = profile !== null;
  const resizable = vw >= 1024;
  const inlineProfile =
    chatOpen &&
    profileOpen &&
    !mobile &&
    contentWidth >= LIST_WIDTH.min + CHAT_MIN_WIDTH + profilePanel.width;
  const drawerProfile = chatOpen && profileOpen && !inlineProfile;

  // Clamp the list so the chat keeps its minimum width (does not overwrite the saved preference).
  const tabletCap = vw < 1024 ? 300 : LIST_WIDTH.max;
  const room = contentWidth - CHAT_MIN_WIDTH - (inlineProfile ? profilePanel.width : 0);
  const listWidth = Math.max(LIST_WIDTH.min, Math.min(listPanel.width, tabletCap, room));

  // Drawer-mode Escape / outside handling lives in the page; keep body from scrolling behind the drawer.
  useEffect(() => {
    if (!drawerProfile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerProfile]);

  const showList = !mobile || !chatOpen;
  const showChat = chatOpen;

  return (
    <div className="flex h-full min-h-0 min-w-0 bg-canvas">
      {showList && (
        <div
          className={cn(
            'min-h-0 min-w-0 border-r border-line',
            chatOpen && !mobile ? 'shrink-0' : 'flex-1',
          )}
          style={chatOpen && !mobile ? { width: listWidth } : undefined}
        >
          {list}
        </div>
      )}
      {showList && chatOpen && !mobile && resizable && (
        <ResizeHandle
          label="Resize conversation list"
          dragging={listPanel.dragging}
          value={listWidth}
          min={LIST_WIDTH.min}
          max={LIST_WIDTH.max}
          onPointerDown={listPanel.onPointerDown}
          onKeyDown={listPanel.onKeyDown}
          onReset={listPanel.reset}
        />
      )}
      {showChat && <div className="min-h-0 min-w-0 flex-1">{chat}</div>}
      {inlineProfile && resizable && (
        <ResizeHandle
          label="Resize customer profile"
          dragging={profilePanel.dragging}
          value={profilePanel.width}
          min={PROFILE_WIDTH.min}
          max={PROFILE_WIDTH.max}
          onPointerDown={profilePanel.onPointerDown}
          onKeyDown={profilePanel.onKeyDown}
          onReset={profilePanel.reset}
        />
      )}
      {inlineProfile && (
        <aside
          aria-label="Customer profile"
          className="min-h-0 shrink-0 border-l border-line bg-white/80 backdrop-blur-[16px]"
          style={{ width: profilePanel.width }}
        >
          {profile}
        </aside>
      )}
      {drawerProfile && (
        <>
          <div
            className="fixed inset-x-0 bottom-0 top-14 z-[70] bg-[rgba(13,37,61,0.25)]"
            onClick={onProfileDismiss}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Customer profile"
            className="fixed bottom-0 right-0 top-14 z-[71] w-[min(360px,100vw)] animate-drawer-in bg-white shadow-[-8px_0_32px_rgba(0,55,112,0.14)]"
          >
            {profile}
          </aside>
        </>
      )}
    </div>
  );
}

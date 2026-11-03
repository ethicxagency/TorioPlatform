'use client';

import { forwardRef } from 'react';
import { CHANNELS } from '../constants';
import type { Conversation, Message, SavedReply } from '../types';
import { AiAssistPanel } from './ai-assist-panel';
import { ChatHeader, type HeaderMenu } from './chat-header';
import { MessageComposer, type ComposerMode } from './message-composer';
import { MessageTimeline } from './message-timeline';

interface Props {
  c: Conversation;
  agents: { id: string; name: string }[];
  meId: string;
  canManage: boolean;
  canReply: boolean;
  /** Opens the Quick Customer Details panel (never toggles it closed). */
  onShowProfile: () => void;
  /** An assignment change is waiting for the server. */
  assigning: boolean;
  savedReplies: SavedReply[];
  messages: Message[] | undefined;
  messagesLoading: boolean;
  messagesError?: string;
  onRetryMessages: () => void;
  mode: ComposerMode;
  draft: string;
  replyTo: { id: string; text: string; who: string } | null;
  sending: boolean;
  aiOpen: boolean;
  profileOpen: boolean;
  showBack: boolean;
  showLabels: boolean;
  menu: HeaderMenu;
  onMenu: (m: HeaderMenu) => void;
  onBack: () => void;
  onAssign: (agentId: string | null) => void;
  onSnooze: (until: Date) => void;
  onResolveToggle: () => void;
  onToggleUrgent: () => void;
  onMarkUnread: () => void;
  onToggleProfile: () => void;
  onCloseChat: () => void;
  onMode: (m: ComposerMode) => void;
  onDraft: (t: string) => void;
  onSend: () => void;
  onReplyTo: (m: Message) => void;
  onClearReplyTo: () => void;
  onCopy: (m: Message) => void;
  onRetrySend?: (m: Message) => void;
  onToggleAi: () => void;
  onCreateOrder?: () => void;
}

export const ChatPanel = forwardRef<HTMLTextAreaElement, Props>(function ChatPanel(p, composerRef) {
  const { c } = p;
  return (
    <section
      aria-label={`Chat with ${c.customer.name}`}
      className="flex h-full min-h-0 min-w-0 flex-col bg-canvas"
    >
      <ChatHeader
        c={c}
        agents={p.agents}
        meId={p.meId}
        canManage={p.canManage}
        onShowProfile={p.onShowProfile}
        assigning={p.assigning}
        profileOpen={p.profileOpen}
        showBack={p.showBack}
        showLabels={p.showLabels}
        menu={p.menu}
        onMenu={p.onMenu}
        onBack={p.onBack}
        onAssign={p.onAssign}
        onSnooze={p.onSnooze}
        onResolveToggle={p.onResolveToggle}
        onToggleUrgent={p.onToggleUrgent}
        onMarkUnread={p.onMarkUnread}
        onOpenProfile={p.onToggleProfile}
        onCloseChat={p.onCloseChat}
      />
      <MessageTimeline
        conversationId={c.id}
        messages={p.messages}
        loading={p.messagesLoading}
        error={p.messagesError}
        customerName={c.customer.name}
        onRetry={p.onRetryMessages}
        onReply={p.onReplyTo}
        onCopy={p.onCopy}
        onRetrySend={p.onRetrySend}
      />
      {p.aiOpen && p.mode === 'reply' && <AiAssistPanel onClose={p.onToggleAi} />}
      <MessageComposer
        key={c.id}
        ref={composerRef}
        customerName={c.customer.name}
        channelLabel={CHANNELS[c.channel.provider].label}
        mode={p.mode}
        draft={p.draft}
        replyTo={p.replyTo}
        savedReplies={p.savedReplies}
        sending={p.sending}
        canReply={p.canReply}
        aiOpen={p.aiOpen}
        onMode={p.onMode}
        onDraft={p.onDraft}
        onSend={p.onSend}
        onClearReplyTo={p.onClearReplyTo}
        onToggleAi={p.onToggleAi}
        onCreateOrder={p.onCreateOrder}
      />
    </section>
  );
});

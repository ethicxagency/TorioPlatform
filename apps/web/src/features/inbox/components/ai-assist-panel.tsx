'use client';

import { Sparkles, X } from 'lucide-react';

interface Props {
  onClose: () => void;
}

/**
 * Integration boundary for Torio Brain suggestions. No AI service exists yet, so this surface
 * says so plainly and never fabricates a suggestion, language variant or knowledge source.
 * When the service ships, render its suggestion here (text, languages, sources) and insert it
 * into the composer draft for the agent to review; never auto-send.
 */
export function AiAssistPanel({ onClose }: Props) {
  return (
    <div
      role="region"
      aria-label="AI Assist"
      className="mx-3 mb-2 flex animate-panel-in items-start gap-2.5 rounded-xl border border-primary-line bg-primary-tint px-3 py-2.5 text-[12.5px] text-[#3A3C42]"
    >
      <Sparkles size={14} className="mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">AI Assist isn&apos;t connected yet</div>
        <p className="m-0 mt-0.5 text-muted">
          Suggested replies from Brain will appear here once the AI service is set up. Nothing is
          generated or sent automatically, and every suggestion will need your review.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss AI Assist"
        onClick={onClose}
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-white/70"
      >
        <X size={13} />
      </button>
    </div>
  );
}

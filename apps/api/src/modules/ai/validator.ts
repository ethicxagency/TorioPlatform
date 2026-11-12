import type { BrainConfig } from '@torio/contracts';
import { describeFigure, evaluate } from './evaluator';

const CHANNEL_LIMIT: Record<string, number> = { WHATSAPP: 1600, INSTAGRAM: 1000, MESSENGER: 2000 };

export interface Validated {
  text: string;
  warnings: string[];
  /** Must not be shown: it exposes internal instructions or a secret. */
  blocked: boolean;
}

/** Last checks before a draft reaches the agent. It never changes the meaning of a reply; it blocks, trims or flags. */
export function validateDraft(i: {
  text: string;
  channel: string;
  brain: BrainConfig;
  knowledge: string;
  lastCustomerMessage: string;
  weights: Parameters<typeof evaluate>[0]['weights'];
}): Validated {
  const warnings: string[] = [];
  let text = i.text
    .replace(/^\s*(reply|draft|answer)\s*:\s*/i, '')
    .replace(/^```[a-z]*\n?|```$/gim, '')
    .trim();
  const ev = evaluate({
    reply: text,
    lastCustomerMessage: i.lastCustomerMessage,
    knowledge: i.knowledge,
    brain: i.brain,
    weights: i.weights,
  });
  if (ev.leaked)
    return { text: '', warnings: ['Blocked: the reply exposed internal text.'], blocked: true };
  if (!text) return { text: '', warnings: ['The reply was empty.'], blocked: true };
  const limit = CHANNEL_LIMIT[i.channel] ?? 2000;
  if (text.length > limit) {
    const cut = text.slice(0, limit);
    const end = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('! '),
      cut.lastIndexOf('? '),
      cut.lastIndexOf('।'),
    );
    text = (end > limit * 0.5 ? cut.slice(0, end + 1) : cut).trim();
    warnings.push(`Shortened to fit ${i.channel.toLowerCase()} (${limit} characters).`);
  }
  if (ev.ungrounded.length)
    warnings.push(
      `Check before sending: ${ev.ungrounded.map(describeFigure).join(', ')} is not in your Brain knowledge.`,
    );
  for (const f of ev.findings)
    if (!f.startsWith('States ') && !f.startsWith('Reply appears')) warnings.push(f);
  return { text, warnings, blocked: false };
}

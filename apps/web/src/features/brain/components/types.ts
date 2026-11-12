import type { BrainConfig } from '@torio/contracts';

export type Mut = (fn: (c: BrainConfig) => void) => void;
export interface SectionProps {
  d: BrainConfig;
  mut: Mut;
  canWrite: boolean;
  /** Saves one change straight to the server on top of the last saved Brain, then mirrors it into the draft. Rejects on failure. */
  commit?: (fn: (c: BrainConfig) => void) => Promise<unknown>;
}
/** Remove-with-undo contract provided by the page. */
export type Remove = (label: string, restore: () => void) => void;

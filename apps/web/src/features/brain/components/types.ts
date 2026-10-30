import type { BrainConfig } from '@torio/contracts';

export type Mut = (fn: (c: BrainConfig) => void) => void;
export interface SectionProps {
  d: BrainConfig;
  mut: Mut;
  canWrite: boolean;
}
/** Remove-with-undo contract provided by the page. */
export type Remove = (label: string, restore: () => void) => void;

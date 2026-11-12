import { BRAIN_RELEASE } from '@torio/contracts';
import { cn } from '@/lib/utils';

/**
 * The Brain version, read from the central release config. A small, secondary pill beside the title: lighter and smaller than the
 * heading it follows.
 */
export function BrainVersionBadge({
  className,
  size = 'sm',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      title="Torio Brain version"
      aria-label={`Torio Brain version ${BRAIN_RELEASE.version}`}
      data-testid="brain-version"
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-primary-line bg-[#F3F3FF] font-semibold tabular-nums leading-none text-primary',
        size === 'sm' ? 'h-[19px] px-2 text-[11px]' : 'h-6 px-2.5 text-[12.5px]',
        className,
      )}
    >
      v{BRAIN_RELEASE.version}
    </span>
  );
}

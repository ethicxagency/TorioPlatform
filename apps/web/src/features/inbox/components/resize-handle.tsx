'use client';

import { cn } from '@/lib/utils';

interface Props {
  label: string;
  dragging: boolean;
  value: number;
  min: number;
  max: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onReset: () => void;
}

/** Keyboard- and pointer-operable separator. Double-click resets the panel to its default width. */
export function ResizeHandle({
  label,
  dragging,
  value,
  min,
  max,
  onPointerDown,
  onKeyDown,
  onReset,
}: Props) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      title="Drag to resize · double-click to reset"
      className={cn(
        'group relative z-10 -mx-[3px] w-[7px] shrink-0 cursor-col-resize touch-none outline-none',
        'max-lg:hidden',
      )}
    >
      <span
        className={cn(
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-all group-hover:w-[3px] group-hover:bg-primary group-focus-visible:w-[3px] group-focus-visible:bg-primary',
          dragging && 'w-[3px] bg-primary',
        )}
      />
    </div>
  );
}

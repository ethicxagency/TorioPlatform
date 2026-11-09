import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';

/** Hugeicons (free stroke-rounded set) with the same size/className API the lucide call sites used. */
export function Icon({
  icon,
  size = 16,
  strokeWidth = 1.75,
  className,
  'aria-hidden': ariaHidden = true,
}: {
  icon: IconSvgElement;
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean;
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={ariaHidden}
    />
  );
}

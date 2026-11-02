import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-10 w-full rounded-[var(--radius-input)] border border-line-input bg-surface px-3 text-sm text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-faint hover:border-[#A8C3DE] focus:border-primary focus:ring-[3px] focus:ring-primary/15 aria-[invalid=true]:border-danger motion-reduce:transition-none',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

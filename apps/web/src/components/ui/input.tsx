import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-ink focus:border-primary focus:ring-2 focus:ring-primary/20',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

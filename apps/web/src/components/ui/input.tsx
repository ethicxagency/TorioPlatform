import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The single form-control recipe: 36px, the shared control radius, neutral border, brand focus ring. Use CONTROL for
 * selects and inputs that size themselves, controlCls for full-width fields and AREA for multi-line text.
 */
export const CONTROL =
  'h-9 rounded-[var(--radius-control)] border border-line bg-white px-2.5 text-[13px] text-ink transition-colors duration-150 placeholder:text-faint hover:border-line-input focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted disabled:hover:border-line aria-[invalid=true]:border-danger motion-reduce:transition-none';
export const controlCls = cn('w-full', CONTROL);
export const AREA = cn(controlCls, 'h-auto resize-y p-2.5 leading-[1.5]');

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(controlCls, className)} {...props} />
));
Input.displayName = 'Input';

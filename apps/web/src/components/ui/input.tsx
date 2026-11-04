import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

export const controlClasses =
  'w-full rounded-control border border-strong bg-surface-raised text-sm text-primary transition-colors placeholder:text-muted hover:border-surface/16 focus-visible:border-accent/50 focus-visible:outline-hidden focus-visible:ring-3 focus-visible:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(controlClasses, 'h-10 px-3', className)}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

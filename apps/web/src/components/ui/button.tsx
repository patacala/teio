import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { ButtonHTMLAttributes, forwardRef } from 'react';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent font-semibold text-on-accent hover:bg-accent-hover',
        primary: 'bg-accent font-semibold text-on-accent hover:bg-accent-hover',
        secondary: 'border border-strong bg-surface-raised text-primary hover:bg-surface-hover',
        outline: 'border border-strong bg-surface-raised text-primary hover:bg-surface-hover',
        ghost: 'text-secondary hover:bg-surface-hover hover:text-primary',
        destructive: 'border border-danger/25 bg-danger/10 text-danger hover:bg-danger/20',
        danger: 'border border-danger/25 bg-danger/10 text-danger hover:bg-danger/20',
        ai: 'action-surface text-primary hover:border-accent/25 hover:text-accent',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };

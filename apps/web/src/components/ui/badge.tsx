import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 capitalize',
  {
    variants: {
      variant: {
        default: 'border-subtle bg-surface/5 text-secondary',
        neutral: 'border-subtle bg-surface/5 text-secondary',
        secondary: 'border-accent/15 bg-olive-dark/80 text-accent',
        outline: 'border-strong bg-transparent text-secondary',
        ai: 'border-accent/15 bg-olive-dark/80 text-accent',
        success: 'border-success/20 bg-success/10 text-success',
        positive: 'border-success/20 bg-success/10 text-success',
        warn: 'border-warning/20 bg-warning/10 text-warning',
        warning: 'border-warning/20 bg-warning/10 text-warning',
        destructive: 'border-danger/20 bg-danger/10 text-danger',
        negative: 'border-danger/20 bg-danger/10 text-danger',
        info: 'border-info/20 bg-info/10 text-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };

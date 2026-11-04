import { cn } from '@/lib/utils';
import { TextareaHTMLAttributes, forwardRef } from 'react';
import { controlClasses } from './input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(controlClasses, 'min-h-[100px] px-3 py-2.5 leading-relaxed', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

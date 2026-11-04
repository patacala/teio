'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import { ComponentPropsWithoutRef, ElementRef, forwardRef } from 'react';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 max-w-full items-center justify-start gap-0.5 overflow-x-auto rounded-control border border-subtle bg-surface-raised p-1 [scrollbar-width:none]',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-3 text-sm font-medium transition-colors',
      'text-secondary hover:text-primary disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:border-accent/12 data-[state=active]:bg-olive-dark data-[state=active]:text-primary',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-2 focus-visible:outline-hidden', className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

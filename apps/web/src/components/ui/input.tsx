import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-ink text-sm outline-none transition-colors placeholder:text-ink-4 focus-visible:border-ring focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'box-border w-full resize-y rounded-lg border border-input bg-background px-3.5 py-2.5 text-ink text-sm outline-none transition-colors placeholder:text-ink-4 focus-visible:border-ring focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-ink text-sm outline-none focus-visible:border-ring focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );
}

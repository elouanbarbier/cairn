import { Command as CommandPrimitive } from 'cmdk';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('flex flex-col', className)} {...props} />;
}

export function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <CommandPrimitive.Input
      className={cn(
        'h-10 min-w-0 flex-1 border-0 bg-transparent text-ink text-lg outline-none placeholder:text-ink-4',
        className,
      )}
      {...props}
    />
  );
}

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn(
        'max-h-[min(440px,60vh)] scroll-py-2 overflow-y-auto overscroll-contain px-2 pt-2 pb-1.5',
        className,
      )}
      {...props}
    />
  );
}

export function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className={cn('px-2.5 py-6 text-center text-ink-4', className)} {...props} />;
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-ink-4 [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-0.5 first:[&_[cmdk-group-heading]]:pt-2',
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'group flex min-h-9.5 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 text-ink-2 outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-ink data-[selected=true]:shadow-[inset_2px_0_0_var(--brand)] data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

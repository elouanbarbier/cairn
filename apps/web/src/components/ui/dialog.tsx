import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  overlayClassName,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { overlayClassName?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn('fixed inset-0 z-50 bg-overlay data-[state=open]:animate-overlay-in', overlayClassName)}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-[12vh] left-1/2 z-50 w-[calc(100%-32px)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-popover-border bg-popover text-popover-foreground shadow-float outline-none data-[state=open]:animate-dialog-in',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('font-semibold text-base text-ink', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-ink-3 text-sm', className)} {...props} />;
}

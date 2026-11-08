import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium text-sm transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline: 'border border-border bg-background text-ink hover:bg-accent',
        dashed: 'border border-input border-dashed bg-background text-ink-2 hover:bg-accent',
        ghost: 'bg-transparent text-ink-3 hover:bg-accent hover:text-ink',
        plain: 'bg-transparent text-ink hover:bg-accent',
      },
      size: {
        default: 'h-7.5 px-2.5',
        sm: 'h-7 px-2 text-small',
        icon: 'size-7.5 p-0',
        'icon-sm': 'size-7 p-0',
        'icon-xs': 'size-6.5 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };

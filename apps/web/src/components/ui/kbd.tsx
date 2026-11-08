import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const kbdVariants = cva(
  'inline-flex items-center justify-center rounded font-sans font-medium text-micro leading-[18px] tabular-nums',
  {
    variants: {
      variant: {
        /** Bordered, on light surfaces (sidebar ⌘K, property shortcuts). */
        outline: 'border border-kbd-border bg-kbd px-[5px] text-kbd-foreground',
        /** Filled, inside menus and the palette. */
        solid: 'bg-kbd-solid px-[5px] text-kbd-foreground',
        /** On the primary button. */
        inverse: 'bg-kbd-inverse px-[5px] text-primary-foreground',
        /** Light hint inside property buttons. */
        hint: 'border border-border px-1 font-normal text-ink-4 leading-4',
      },
    },
    defaultVariants: { variant: 'solid' },
  },
);

export function Kbd({ className, variant, ...props }: ComponentProps<'kbd'> & VariantProps<typeof kbdVariants>) {
  return <kbd data-slot="kbd" className={cn(kbdVariants({ variant, className }))} {...props} />;
}

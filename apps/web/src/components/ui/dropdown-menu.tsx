import { CheckIcon } from 'lucide-react';
import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = 'start',
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-48 overflow-y-auto rounded-lg border border-popover-border bg-popover p-1 text-popover-foreground shadow-float data-[state=open]:animate-menu-in',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

const itemClass =
  'relative flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-ink-2 outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-ink data-[disabled]:opacity-50';

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  return <MenuPrimitive.Item className={cn(itemClass, className)} {...props} />;
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(itemClass, 'pr-8', className)} {...props}>
      {children}
      <MenuPrimitive.ItemIndicator className="absolute right-2 flex items-center">
        <CheckIcon className="size-3.5 text-ink-3" aria-hidden />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem className={cn(itemClass, 'pr-8', className)} {...props}>
      {children}
      <MenuPrimitive.ItemIndicator className="absolute right-2 flex items-center">
        <CheckIcon className="size-3.5 text-ink-3" aria-hidden />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label className={cn('px-2 pt-1.5 pb-1 font-medium text-caption text-ink-4', className)} {...props} />
  );
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

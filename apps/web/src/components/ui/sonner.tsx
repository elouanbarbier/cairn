import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/lib/theme';

export function Toaster() {
  const { setting } = useTheme();
  return (
    <Sonner
      theme={setting}
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--popover)',
          color: 'var(--popover-foreground)',
          border: '1px solid var(--popover-border)',
          fontSize: '13px',
        },
      }}
    />
  );
}

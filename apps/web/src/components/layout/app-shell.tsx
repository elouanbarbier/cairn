import { Outlet, useNavigate } from '@tanstack/react-router';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { CommandPalette } from '@/components/command-palette';
import { CreateTopicDialog } from '@/components/create-topic-dialog';
import { ShortcutsDialog } from '@/components/shortcuts-dialog';
import { useHotkeys } from '@/lib/hotkeys';
import { useProjects } from '@/lib/queries';
import { useUi } from '@/lib/ui-state';
import { Sidebar } from './sidebar';

export function AppShell() {
  const { t } = useTranslation();
  const ui = useUi();
  const navigate = useNavigate();
  const projects = useProjects();

  useHotkeys({
    'mod+k': () => (ui.paletteOpen ? ui.closePalette() : ui.openPalette()),
    '/': () => ui.openPalette(),
    c: () => ui.openCreate(ui.screenContext),
    '?': () => ui.setShortcutsOpen(true),
    'g o': () => void navigate({ to: '/' }),
    'g p': () => {
      const first = projects.data?.[0];
      if (first) void navigate({ to: '/p/$key', params: { key: first.key } });
    },
  });

  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <DialogPrimitive.Root open={ui.navOpen} onOpenChange={ui.setNavOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-overlay-in md:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex shadow-float outline-none md:hidden">
            <DialogPrimitive.Title className="sr-only">{t('nav.main')}</DialogPrimitive.Title>
            <Sidebar onNavigate={() => ui.setNavOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>

      <CommandPalette />
      <CreateTopicDialog />
      <ShortcutsDialog />
    </div>
  );
}

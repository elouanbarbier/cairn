import { Outlet, useNavigate } from '@tanstack/react-router';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { CommandPalette } from '@/components/command-palette';
import { CreateProjectDialog, CreateSubprojectDialog } from '@/components/create-project-dialog';
import { CreateTopicDialog } from '@/components/create-topic-dialog';
import { ShortcutsDialog } from '@/components/shortcuts-dialog';
import { SetupPage } from '@/features/setup/setup-page';
import { TopicPanel } from '@/features/topic/topic-page';
import { useHotkeys } from '@/lib/hotkeys';
import { useProjects, useSetupStatus } from '@/lib/queries';
import { useTopicPanel } from '@/lib/topic-panel';
import { useUi } from '@/lib/ui-state';
import { Sidebar } from './sidebar';

/** An empty workspace first asks for its first account; then the app itself. */
export function AppShell() {
  const setup = useSetupStatus();
  if (setup.isPending) return null;
  if (setup.data?.required) return <SetupPage />;
  return <Workspace />;
}

function Workspace() {
  const { t } = useTranslation();
  const ui = useUi();
  const navigate = useNavigate();
  const projects = useProjects();
  const panel = useTopicPanel();

  useHotkeys({
    'mod+k': () => (ui.paletteOpen ? ui.closePalette() : ui.openPalette()),
    '/': () => ui.openPalette(),
    c: () => ui.openCreate(ui.screenContext),
    'shift+p': () => ui.setProjectDialogOpen(true),
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

      {panel.current ? <TopicPanel topicRef={panel.current} onClose={panel.close} /> : null}

      <CommandPalette />
      <CreateTopicDialog />
      <CreateProjectDialog />
      <CreateSubprojectDialog />
      <ShortcutsDialog />
    </div>
  );
}

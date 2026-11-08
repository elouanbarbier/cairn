import type { TopicStatus } from '@cairn/shared';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

/** Where a new topic should land, from the current screen. */
export interface CreateContext {
  projectId?: string;
  subprojectId?: string | null;
  status?: TopicStatus;
}

/** The palette can open on a sub-page acting on one topic. */
export type PalettePage = { kind: 'root' } | { kind: 'status' | 'priority'; ref: string };

interface UiState {
  paletteOpen: boolean;
  palettePage: PalettePage;
  openPalette: (page?: PalettePage) => void;
  closePalette: () => void;
  setPalettePage: (page: PalettePage) => void;
  createOpen: boolean;
  createContext: CreateContext;
  openCreate: (context?: CreateContext) => void;
  closeCreate: () => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  /** New project dialog (Shift+P). */
  projectDialogOpen: boolean;
  setProjectDialogOpen: (open: boolean) => void;
  /** New subproject dialog, for the project with this key. */
  subprojectDialogFor: string | null;
  setSubprojectDialogFor: (projectKey: string | null) => void;
  /** Sidebar drawer on small screens. */
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  /** What the current screen offers as default context (set by pages). */
  screenContext: CreateContext & { topicRef?: string; subprojectName?: string; projectName?: string };
  setScreenContext: (context: UiState['screenContext']) => void;
}

const UiContext = createContext<UiState | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [palettePage, setPalettePage] = useState<PalettePage>({ kind: 'root' });
  const [createOpen, setCreateOpen] = useState(false);
  const [createContext, setCreateContext] = useState<CreateContext>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [subprojectDialogFor, setSubprojectDialogFor] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [screenContext, setScreenContext] = useState<UiState['screenContext']>({});

  const value = useMemo<UiState>(
    () => ({
      paletteOpen,
      palettePage,
      openPalette: (page = { kind: 'root' }) => {
        setPalettePage(page);
        setPaletteOpen(true);
      },
      closePalette: () => setPaletteOpen(false),
      setPalettePage,
      createOpen,
      createContext,
      openCreate: (context) => {
        setCreateContext(context ?? {});
        setCreateOpen(true);
      },
      closeCreate: () => setCreateOpen(false),
      shortcutsOpen,
      setShortcutsOpen,
      projectDialogOpen,
      setProjectDialogOpen,
      subprojectDialogFor,
      setSubprojectDialogFor,
      navOpen,
      setNavOpen,
      screenContext,
      setScreenContext,
    }),
    [
      paletteOpen,
      palettePage,
      createOpen,
      createContext,
      shortcutsOpen,
      projectDialogOpen,
      subprojectDialogFor,
      navOpen,
      screenContext,
    ],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const context = useContext(UiContext);
  if (!context) throw new Error('useUi must be used inside UiProvider');
  return context;
}

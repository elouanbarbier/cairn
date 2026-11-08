import type { ProjectSummary } from '@cairn/shared';
import { Link, useParams } from '@tanstack/react-router';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  LayoutDashboardIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, ColorSquare } from '@/components/bits';
import { CairnLogo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { type Language, setLanguage } from '@/i18n';
import { useMe, useProjects } from '@/lib/queries';
import { type ThemeSetting, useTheme } from '@/lib/theme';
import { useUi } from '@/lib/ui-state';
import { cn, isMac } from '@/lib/utils';

const EXPANDED_KEY = 'cairn.sidebar.expanded';

/** Stored list of unfolded project keys, or `null` on a first visit. */
function readExpanded(): string[] | null {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : null;
  } catch {
    return null;
  }
}

const navItem =
  'flex h-7.5 items-center gap-2.5 rounded-md px-2 font-medium text-ink-2 no-underline transition-colors duration-150 hover:bg-sidebar-accent hover:text-ink';
const navActive = 'bg-sidebar-accent text-ink';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const ui = useUi();
  const me = useMe();
  const projects = useProjects();
  const params = useParams({ strict: false });
  const currentKey = params.key?.toUpperCase();

  const [stored, setStored] = useState<string[] | null>(readExpanded);
  // First visit: the first project starts unfolded.
  const firstKey = projects.data?.[0]?.key;
  const expanded = stored ?? (firstKey ? [firstKey] : []);

  const update = (next: string[]) => {
    setStored(next);
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
    } catch {
      // Not persisted.
    }
  };

  // Unfold the project being viewed (once per navigation, so it can still be folded).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to navigation
  useEffect(() => {
    if (currentKey && !expanded.includes(currentKey)) update([...expanded, currentKey]);
  }, [currentKey]);

  const toggle = (key: string) =>
    update(expanded.includes(key) ? expanded.filter((k) => k !== key) : [...expanded, key]);

  return (
    <nav
      aria-label={t('nav.main')}
      className="flex h-full w-58 shrink-0 flex-col gap-4.5 overflow-y-auto border-sidebar-border border-r bg-sidebar px-2.5 pt-3 pb-4"
    >
      <div className="flex items-center gap-2 py-0.5 pr-1 pl-1.5">
        <CairnLogo />
        <span className="font-semibold text-base tracking-[-0.01em]">{t('app.name')}</span>
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={t('nav.search')} onClick={() => ui.openPalette()}>
            <SearchIcon className="size-4" strokeWidth={1.75} />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('nav.newTopic')}
            className="text-ink-2"
            onClick={() => ui.openCreate(ui.screenContext)}
          >
            <PlusIcon className="size-3.5" strokeWidth={2} />
          </Button>
        </span>
      </div>

      <div className="flex flex-col gap-px">
        <Link
          to="/"
          className={navItem}
          activeOptions={{ exact: true, includeSearch: false }}
          activeProps={{ className: navActive }}
          onClick={onNavigate}
        >
          <LayoutDashboardIcon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {t('nav.overview')}
        </Link>
        <Link to="/mes-sujets" className={navItem} activeProps={{ className: navActive }} onClick={onNavigate}>
          <CircleUserRoundIcon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {t('nav.myTopics')}
          {me.data ? (
            <span className="ml-auto font-normal text-ink-4 text-xs tabular-nums">{me.data.myOpenTopicCount}</span>
          ) : null}
        </Link>
        <button
          type="button"
          className={cn(navItem, 'border-0 bg-transparent text-left')}
          onClick={() => ui.openPalette()}
        >
          <SearchIcon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {t('nav.search')}
          <Kbd variant="outline" className="ml-auto">
            {isMac ? '⌘K' : 'Ctrl K'}
          </Kbd>
        </button>
      </div>

      <div className="flex flex-col gap-px">
        <div className="flex h-6.5 items-center px-2 font-medium text-caption text-ink-4">{t('nav.projects')}</div>
        {projects.data?.map((project) => (
          <ProjectTree
            key={project.id}
            project={project}
            expanded={expanded.includes(project.key)}
            onToggle={() => toggle(project.key)}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 py-1 pr-1 pl-2">
        {me.data ? (
          <>
            <Avatar user={me.data.user} size={22} />
            <span className="truncate font-medium">{me.data.user.name.split(' ')[0]}</span>
          </>
        ) : null}
        <SettingsMenu />
      </div>
    </nav>
  );
}

function ProjectTree({
  project,
  expanded,
  onToggle,
  onNavigate,
}: {
  project: ProjectSummary;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'nav.collapse' : 'nav.expand', { name: project.name })}
          className="absolute top-1/2 left-1 z-10 grid size-5 -translate-y-1/2 place-items-center rounded border-0 bg-transparent p-0 text-ink-4 hover:text-ink"
        >
          <Chevron className="size-3" strokeWidth={2.25} aria-hidden />
        </button>
        <Link
          to="/p/$key"
          params={{ key: project.key }}
          activeOptions={{ exact: true, includeSearch: false }}
          activeProps={{ className: navActive, 'aria-current': 'page' }}
          onClick={onNavigate}
          className={cn(navItem, 'gap-2 pl-6.5')}
        >
          <ColorSquare color={project.color} size={14} />
          <span className="truncate">{project.name}</span>
          <span className="ml-auto font-normal text-ink-4 text-xs tabular-nums">{project.openCount}</span>
        </Link>
      </div>
      {expanded
        ? project.subprojects.map((sub) => (
            <Link
              key={sub.id}
              to="/p/$key/s/$subprojectId"
              params={{ key: project.key, subprojectId: sub.id }}
              activeOptions={{ includeSearch: false }}
              activeProps={{ className: 'bg-sidebar-accent text-ink font-medium', 'aria-current': 'page' }}
              onClick={onNavigate}
              className="flex h-7 items-center rounded-md pr-2 pl-10.5 text-ink-3 text-small no-underline transition-colors duration-150 hover:bg-sidebar-accent hover:text-ink"
            >
              <span className="truncate">{sub.name}</span>
              <span className="ml-auto font-normal text-ink-4 text-xs tabular-nums">{sub.openCount}</span>
            </Link>
          ))
        : null}
    </>
  );
}

function SettingsMenu() {
  const { t, i18n } = useTranslation();
  const { setting, setSetting } = useTheme();
  const ui = useUi();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={t('nav.settings')}>
          <SlidersHorizontalIcon className="size-4" strokeWidth={1.75} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuLabel>{t('settings.theme')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={setting} onValueChange={(v) => setSetting(v as ThemeSetting)}>
          {(['system', 'light', 'dark'] as const).map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(`settings.themes.${value}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('settings.language')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={i18n.language} onValueChange={(v) => setLanguage(v as Language)}>
          {(['fr', 'en'] as const).map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(`settings.languages.${value}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => ui.setShortcutsOpen(true)}>
          {t('settings.shortcuts')}
          <Kbd className="ml-auto">?</Kbd>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

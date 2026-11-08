import { type ProjectSummary, sortKeyBetween } from '@cairn/shared';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, useParams } from '@tanstack/react-router';
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  LayoutDashboardIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { type HTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, ColorSquare } from '@/components/bits';
import { CairnLogo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useArchivedProjects, useMe, useProjects, useUpdateProject, useUpdateSubproject } from '@/lib/queries';
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
  const updateProject = useUpdateProject();
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
        <div className="flex h-6.5 items-center pr-1 pl-2 font-medium text-caption text-ink-4">
          {t('nav.projects')}
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label={t('nav.newProject')}
            title={`${t('nav.newProject')} (⇧P)`}
            onClick={() => {
              onNavigate?.();
              ui.setProjectDialogOpen(true);
            }}
          >
            <PlusIcon className="size-3.5" strokeWidth={2} />
          </Button>
        </div>
        {projects.data?.length === 0 ? (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              ui.setProjectDialogOpen(true);
            }}
            className={cn(navItem, 'border-0 bg-transparent text-left font-normal text-ink-3')}
          >
            <PlusIcon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
            {t('nav.newProject')}
          </button>
        ) : null}
        <SortableGroup
          items={projects.data ?? []}
          onMove={(project, sortOrder) => updateProject.mutate({ key: project.key, patch: { sortOrder } })}
        >
          {projects.data?.map((project) => (
            <SortableItem key={project.id} id={project.id}>
              {(dragProps) => (
                <ProjectTree
                  project={project}
                  expanded={expanded.includes(project.key)}
                  onToggle={() => toggle(project.key)}
                  onNavigate={onNavigate}
                  dragProps={dragProps}
                />
              )}
            </SortableItem>
          ))}
        </SortableGroup>
        <ArchivedProjects onNavigate={onNavigate} />
      </div>

      <div className="mt-auto flex items-center gap-2 py-1 pr-1 pl-2">
        {me.data ? (
          <>
            <Avatar user={me.data.user} size={22} />
            <span className="truncate font-medium">{me.data.user.name.split(' ')[0]}</span>
          </>
        ) : null}
        <Button variant="ghost" size="icon-sm" className="ml-auto" asChild>
          <Link
            to="/parametres"
            aria-label={t('nav.settings')}
            title={t('nav.settings')}
            activeProps={{ className: 'bg-sidebar-accent text-ink', 'aria-current': 'page' }}
            onClick={onNavigate}
          >
            <SlidersHorizontalIcon className="size-4" strokeWidth={1.75} />
          </Link>
        </Button>
      </div>
    </nav>
  );
}

type DragProps = HTMLAttributes<HTMLElement>;

/**
 * Items reordered by dragging (pointer, or Space then arrows on a focused link). The new place becomes a fractional
 * sort key between the new neighbours.
 */
function SortableGroup<T extends { id: string; sortOrder: string }>({
  items,
  onMove,
  children,
}: {
  items: T[];
  onMove: (item: T, sortOrder: string) => void;
  children: ReactNode;
}) {
  const lastDrop = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDrop.current = Date.now();
    const from = items.findIndex((i) => i.id === active.id);
    const to = over ? items.findIndex((i) => i.id === over.id) : -1;
    const item = items[from];
    if (!item || to < 0 || from === to) return;
    const moved = arrayMove(items, from, to);
    try {
      onMove(item, sortKeyBetween(moved[to - 1]?.sortOrder ?? null, moved[to + 1]?.sortOrder ?? null));
    } catch {
      // Equal neighbouring keys: keep the order as it is.
    }
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div
          className="flex flex-col gap-px"
          onClickCapture={(event) => {
            // A drop is not a click.
            if (Date.now() - lastDrop.current < 150) event.preventDefault();
          }}
        >
          {children}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({ id, children }: { id: string; children: (dragProps: DragProps) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    attributes: { role: 'link' },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex flex-col gap-px', isDragging && 'relative z-10 opacity-80')}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

function ProjectTree({
  project,
  expanded,
  onToggle,
  onNavigate,
  dragProps,
}: {
  project: ProjectSummary;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  dragProps: DragProps;
}) {
  const { t } = useTranslation();
  const ui = useUi();
  const updateSubproject = useUpdateSubproject();
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  return (
    <>
      <div className="group/row relative">
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
          {...dragProps}
          onClick={onNavigate}
          className={cn(navItem, 'gap-2 pl-6.5')}
        >
          <ColorSquare color={project.color} size={14} />
          <span className="truncate">{project.name}</span>
          <span className="ml-auto font-normal text-ink-4 text-xs tabular-nums group-focus-within/row:invisible group-hover/row:invisible">
            {project.openCount}
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('palette.newSubprojectIn', { name: project.name })}
          title={t('palette.newSubprojectIn', { name: project.name })}
          onClick={() => {
            onNavigate?.();
            ui.setSubprojectDialogFor(project.key);
          }}
          className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 hover:bg-background focus-visible:opacity-100 group-hover/row:opacity-100"
        >
          <PlusIcon className="size-3.5" strokeWidth={2} />
        </Button>
      </div>
      {expanded ? (
        <SortableGroup
          items={project.subprojects}
          onMove={(sub, sortOrder) => updateSubproject.mutate({ id: sub.id, patch: { sortOrder } })}
        >
          {project.subprojects.map((sub) => (
            <SortableItem key={sub.id} id={sub.id}>
              {(subDragProps) => (
                <Link
                  to="/p/$key/s/$subprojectId"
                  params={{ key: project.key, subprojectId: sub.id }}
                  activeOptions={{ includeSearch: false }}
                  activeProps={{ className: 'bg-sidebar-accent text-ink font-medium', 'aria-current': 'page' }}
                  {...subDragProps}
                  onClick={onNavigate}
                  className="flex h-7 items-center rounded-md pr-2 pl-10.5 text-ink-3 text-small no-underline transition-colors duration-150 hover:bg-sidebar-accent hover:text-ink"
                >
                  <span className="truncate">{sub.name}</span>
                  <span className="ml-auto font-normal text-ink-4 text-xs tabular-nums">{sub.openCount}</span>
                </Link>
              )}
            </SortableItem>
          ))}
        </SortableGroup>
      ) : null}
    </>
  );
}

/** Archived projects, folded at the end of the list; shown only when there are some. */
function ArchivedProjects({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const archived = useArchivedProjects();
  const [open, setOpen] = useState(false);
  if (!archived.data?.length) return null;
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(navItem, 'gap-2 border-0 bg-transparent pl-1.5 text-left font-normal text-ink-4')}
      >
        <Chevron className="mx-[3px] size-3" strokeWidth={2.25} aria-hidden />
        <ArchiveIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        {t('nav.archivedProjects')}
        <span className="ml-auto text-xs tabular-nums">{archived.data.length}</span>
      </button>
      {open
        ? archived.data.map((project) => (
            <Link
              key={project.id}
              to="/p/$key"
              params={{ key: project.key }}
              activeOptions={{ exact: true, includeSearch: false }}
              activeProps={{ className: 'bg-sidebar-accent text-ink', 'aria-current': 'page' }}
              onClick={onNavigate}
              className="flex h-7 items-center gap-2 rounded-md pr-2 pl-6.5 text-ink-3 text-small no-underline transition-colors duration-150 hover:bg-sidebar-accent hover:text-ink"
            >
              <ColorSquare color={project.color} size={10} className="opacity-60" />
              <span className="truncate">{project.name}</span>
            </Link>
          ))
        : null}
    </>
  );
}

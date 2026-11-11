import {
  computeProgress,
  diffDays,
  elapsedDays,
  isClosed,
  isDormant,
  type ProjectSummary,
  type TopicStatus,
  type TopicSummary,
} from '@cairn/shared';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from '@tanstack/react-router';
import { ChevronDownIcon, ChevronRightIcon, ListTodoIcon, PlusIcon, XIcon } from 'lucide-react';
import { type HTMLAttributes, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Count, DormantBadge, EmptyState, LabelChip, ProgressBar, TopicRef } from '@/components/bits';
import { PriorityIcon, StatusIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { formatShortDate, todayISO } from '@/lib/format';
import { useHotkeys } from '@/lib/hotkeys';
import { useUpdateTopic } from '@/lib/queries';
import { useTopicPanel } from '@/lib/topic-panel';
import { type CreateContext, type PaletteField, useUi } from '@/lib/ui-state';
import { cn } from '@/lib/utils';
import type { GroupBy } from '@/router';
import { LIST_STATUS_ORDER } from './filters';
import { planListDrop } from './reorder';

interface Group {
  key: string;
  title: ReactNode;
  icon?: ReactNode;
  /** Subproject link, when grouped by subproject. */
  link?: { key: string; subprojectId: string };
  topics: TopicSummary[];
  /** All topics of the group (for counters), not only the visible ones. */
  all: TopicSummary[];
  createContext: { subprojectId?: string | null; status?: TopicStatus };
  /** Archived subproject: shown, but nothing can be dropped or created there. */
  archived?: boolean;
}

const byListOrder = (a: TopicSummary, b: TopicSummary) =>
  LIST_STATUS_ORDER.indexOf(a.status) - LIST_STATUS_ORDER.indexOf(b.status) || (a.sortOrder < b.sortOrder ? -1 : 1);

function buildGroups(
  visible: TopicSummary[],
  all: TopicSummary[],
  group: GroupBy,
  project: ProjectSummary | undefined,
  noSubprojectLabel: string,
  statusLabel: (s: TopicStatus) => string,
  archivedLabel: (name: string) => string,
): Group[] {
  if (group === 'status' || !project) {
    return LIST_STATUS_ORDER.map((status) => ({
      key: status,
      title: statusLabel(status),
      icon: <StatusIcon status={status} />,
      topics: visible.filter((t) => t.status === status).sort(byListOrder),
      all: all.filter((t) => t.status === status),
      createContext: { status },
    })).filter((g) => g.topics.length > 0);
  }
  const groups: Group[] = project.subprojects.map((sub) => ({
    key: sub.id,
    title: sub.name,
    link: { key: project.key, subprojectId: sub.id },
    topics: visible.filter((t) => t.subprojectId === sub.id).sort(byListOrder),
    all: all.filter((t) => t.subprojectId === sub.id),
    createContext: { subprojectId: sub.id },
  }));
  // Topics of archived subprojects stay visible, under their subproject's name.
  for (const sub of project.archivedSubprojects) {
    const inSub = all.filter((t) => t.subprojectId === sub.id);
    if (inSub.length === 0) continue;
    groups.push({
      key: sub.id,
      title: archivedLabel(sub.name),
      link: { key: project.key, subprojectId: sub.id },
      topics: visible.filter((t) => t.subprojectId === sub.id).sort(byListOrder),
      all: inSub,
      createContext: { subprojectId: null },
      archived: true,
    });
  }
  groups.push({
    key: 'none',
    title: noSubprojectLabel,
    topics: visible.filter((t) => t.subprojectId === null).sort(byListOrder),
    all: all.filter((t) => t.subprojectId === null),
    createContext: { subprojectId: null },
  });
  const archivedIds = new Set(project.archivedSubprojects.map((s) => s.id));
  return groups.filter(
    (g) => g.topics.length > 0 || (g.key !== 'none' && !archivedIds.has(g.key) && g.all.length === 0),
  );
}

const GROUP_PREFIX = 'group:';

/**
 * Grouped topic list. Keyboard: J/K move, Enter opens, S/P/L/M/D change the status, priority, labels, subproject or
 * due date of the highlighted topic, or of the selection (X). Rows can be dragged within a group or to another group
 * (Space picks a focused row up, arrows move it, Space drops it).
 */
export function TopicList({
  topics,
  allTopics,
  group,
  project,
  dormancyDays,
  emptyLabel,
  createContext,
  showProject = false,
  emptyAction,
}: {
  topics: TopicSummary[];
  allTopics: TopicSummary[];
  group: GroupBy;
  /** Enables grouping by subproject. */
  project?: ProjectSummary;
  dormancyDays: number;
  emptyLabel: string;
  /** Where the group "+" buttons create topics. */
  createContext?: CreateContext;
  /** Show the project of each topic (lists spanning several projects). */
  showProject?: boolean;
  /** Main action when the list is empty (create a topic, clear the filters). */
  emptyAction?: ReactNode;
}) {
  const { t } = useTranslation();
  const ui = useUi();
  const panel = useTopicPanel();
  const update = useUpdateTopic();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const lastDragEnd = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const today = todayISO();
  const effectiveGroup: GroupBy = project && group === 'subproject' ? 'subproject' : 'status';

  const groups = useMemo(
    () =>
      buildGroups(
        topics,
        allTopics,
        group,
        project,
        t('views.noSubproject'),
        (s) => t(`status.${s}`),
        (name) => t('views.archivedGroup', { name }),
      ),
    [topics, allTopics, group, project, t],
  );
  const flat = groups.filter((g) => !collapsed.includes(g.key)).flatMap((g) => g.topics);
  const active = flat.find((t) => t.id === activeId);
  const byId = useMemo(() => new Map(allTopics.map((x) => [x.id, x])), [allTopics]);
  const dragged = dragId ? byId.get(dragId) : undefined;
  // Selected topics that still exist (a filter or a move may hide some).
  const selection = selected.filter((ref) => allTopics.some((x) => x.ref === ref));
  const isSelected = (ref: string) => selection.includes(ref);
  const toggle = (ref: string) =>
    setSelected((prev) => (prev.includes(ref) ? prev.filter((r) => r !== ref) : [...prev, ref]));

  useEffect(() => {
    if (!activeId) return;
    listRef.current?.querySelector(`[data-topic-id="${activeId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  // The topic open in the panel is the highlighted one, so J/K continue from it.
  useEffect(() => {
    const shown = panel.current ? allTopics.find((x) => x.ref === panel.current) : undefined;
    if (shown) setActiveId(shown.id);
  }, [panel.current, allTopics]);

  // With the panel open, moving through the list follows along in the panel.
  const move = (delta: number) => {
    const index = flat.findIndex((t) => t.id === activeId);
    const next = flat[Math.max(0, Math.min(flat.length - 1, index === -1 ? 0 : index + delta))];
    if (!next) return;
    setActiveId(next.id);
    if (panel.current && panel.current !== next.ref) panel.open(next);
  };

  /** A field of the selection, or of the highlighted topic; with the panel open, of the panel's topic. */
  const field = (kind: PaletteField) => () => {
    if (selection.length > 0) {
      ui.openPalette({ kind, refs: selection });
      return;
    }
    if (!active || panel.current) return false;
    ui.openPalette({ kind, refs: [active.ref] });
  };

  useHotkeys(
    {
      j: () => move(1),
      k: () => move(-1),
      arrowdown: () => move(1),
      arrowup: () => move(-1),
      enter: (event) => {
        // Let focused links and buttons elsewhere handle their own Enter.
        const target = event.target as Node;
        if (!active || (target !== document.body && !listRef.current?.contains(target))) return false;
        panel.open(active);
      },
      s: field('status'),
      p: field('priority'),
      l: field('labels'),
      m: field('subproject'),
      d: field('due'),
      x: () => {
        if (!active) return false;
        toggle(active.ref);
      },
      escape: (event) => {
        const target = event.target as HTMLElement;
        if (selection.length === 0 || ui.paletteOpen || target.closest('[role="dialog"],[role="menu"]')) return false;
        setSelected([]);
      },
    },
    dragId === null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter keeps opening the topic; Space picks the row up.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const groupOf = (id: string | number): Group | undefined => {
    const value = String(id);
    if (value.startsWith(GROUP_PREFIX)) return groups.find((g) => g.key === value.slice(GROUP_PREFIX.length));
    return groups.find((g) => g.topics.some((x) => x.id === value));
  };

  const onDragStart = ({ active: a }: DragStartEvent) => setDragId(String(a.id));
  const onDragOver = ({ over }: DragOverEvent) => setOverGroup(over ? (groupOf(over.id)?.key ?? null) : null);
  const onDragCancel = () => {
    setDragId(null);
    setOverGroup(null);
  };
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    lastDragEnd.current = Date.now();
    setDragId(null);
    setOverGroup(null);
    const topic = byId.get(String(a.id));
    const target = over ? groupOf(over.id) : undefined;
    if (!topic || !over || !target || target.archived) return;
    const overId = String(over.id).startsWith(GROUP_PREFIX) ? null : String(over.id);
    const rect = a.rect.current.translated;
    const patch = planListDrop({
      topic,
      group: effectiveGroup,
      targetKey: target.key,
      targetTopics: target.topics,
      overId,
      below: rect ? rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 : false,
    });
    if (patch) update.mutate({ ref: topic.ref, patch });
  };

  if (groups.length === 0) {
    return (
      <EmptyState icon={<ListTodoIcon strokeWidth={1.75} />} action={emptyAction}>
        {emptyLabel}
      </EmptyState>
    );
  }

  const sourceGroup = dragged ? groupOf(dragged.id)?.key : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        ref={listRef}
        className="flex flex-col pb-8"
        onClickCapture={(event) => {
          // A drop is not a click.
          if (Date.now() - lastDragEnd.current < 150) event.preventDefault();
        }}
      >
        {groups.map((g) => (
          <GroupSection
            key={g.key}
            group={g}
            grouping={group}
            collapsed={collapsed.includes(g.key)}
            onToggleCollapsed={() =>
              setCollapsed((c) => (c.includes(g.key) ? c.filter((k) => k !== g.key) : [...c, g.key]))
            }
            highlighted={overGroup === g.key && sourceGroup !== g.key && !g.archived}
            onAdd={() => ui.openCreate({ projectId: project?.id, ...createContext, ...g.createContext })}
          >
            {g.topics.map((topic) => (
              <SortableRow
                key={topic.id}
                topic={topic}
                active={topic.id === activeId}
                selected={isSelected(topic.ref)}
                selecting={selection.length > 0}
                onSelect={() => toggle(topic.ref)}
                onClick={panel.onLinkClick(topic)}
                onHover={() => setActiveId(topic.id)}
                dormant={isDormant(topic, now, dormancyDays)}
                now={now}
                today={today}
                showProject={showProject}
              />
            ))}
          </GroupSection>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        {dragged ? (
          <TopicRow
            topic={dragged}
            dormant={isDormant(dragged, now, dormancyDays)}
            now={now}
            today={today}
            showProject={showProject}
            className="cursor-grabbing rounded-md border border-brand bg-card shadow-drag"
          />
        ) : null}
      </DragOverlay>
      {selection.length > 0 ? (
        <SelectionBar count={selection.length} onField={(kind) => field(kind)()} onClear={() => setSelected([])} />
      ) : null}
    </DndContext>
  );
}

function GroupSection({
  group: g,
  grouping,
  collapsed,
  onToggleCollapsed,
  highlighted,
  onAdd,
  children,
}: {
  group: Group;
  grouping: GroupBy;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  highlighted: boolean;
  onAdd: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: `${GROUP_PREFIX}${g.key}`, disabled: g.archived });
  const progress = computeProgress(g.all.map((x) => x.status));
  const open = g.all.filter((x) => !isClosed(x.status)).length;
  const name = typeof g.title === 'string' ? g.title : '';
  return (
    <section ref={setNodeRef} aria-label={name || undefined}>
      <div
        className={cn(
          'sticky top-0 z-10 flex h-9.5 items-center gap-2.5 border-border/70 border-b px-5 transition-colors duration-150',
          highlighted ? 'bg-column-active' : 'bg-subtle',
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? 'views.expandGroup' : 'views.collapseGroup', { name })}
          className="grid size-5 place-items-center rounded border-0 bg-transparent p-0 text-ink-4 hover:text-ink"
        >
          {collapsed ? (
            <ChevronRightIcon className="size-3" strokeWidth={2.25} aria-hidden />
          ) : (
            <ChevronDownIcon className="size-3" strokeWidth={2.25} aria-hidden />
          )}
        </button>
        {g.icon}
        {g.link ? (
          <Link
            to="/p/$key/s/$subprojectId"
            params={g.link}
            className="font-semibold text-ink text-small no-underline hover:underline"
          >
            {g.title}
          </Link>
        ) : (
          <span className="font-semibold text-small">{g.title}</span>
        )}
        <Count>{t('views.openCount', { count: open })}</Count>
        {grouping === 'subproject' ? (
          <span className="ml-2 hidden items-center gap-2 text-ink-4 text-xs tabular-nums sm:inline-flex">
            <ProgressBar progress={progress} height={4} label={name} className="w-14 bg-border" />
            {progress.done}/{progress.total}
          </span>
        ) : null}
        {g.archived ? null : (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label={t('views.addTopicTo', { name })}
            onClick={onAdd}
          >
            <PlusIcon className="size-3.5" strokeWidth={2} />
          </Button>
        )}
      </div>
      {collapsed ? null : (
        <SortableContext items={g.topics.map((x) => x.id)} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      )}
    </section>
  );
}

interface RowProps {
  topic: TopicSummary;
  dormant: boolean;
  now: Date;
  today: string;
  showProject: boolean;
}

/** A row that can be dragged and selected. The checkbox sits beside the link, not inside it. */
function SortableRow({
  active,
  selected,
  selecting,
  onSelect,
  onClick,
  onHover,
  ...row
}: RowProps & {
  active: boolean;
  selected: boolean;
  /** A selection is in progress: every checkbox shows. */
  selecting: boolean;
  onSelect: () => void;
  onClick: (event: MouseEvent) => void;
  onHover: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.topic.id,
    // The row stays a link for assistive technologies; dragging is announced by dnd-kit.
    attributes: { role: 'link' },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('group/row relative', isDragging && 'opacity-40')}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        aria-label={t('selection.select', { ref: row.topic.ref })}
        className={cn(
          'absolute top-1/2 left-1 z-[1] m-0 size-3.5 -translate-y-1/2 cursor-pointer accent-[var(--brand)] focus-visible:opacity-100',
          selected || selecting ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
        )}
      />
      <TopicRow
        {...row}
        onClick={onClick}
        onHover={onHover}
        dragProps={{ ...attributes, ...listeners }}
        className={cn(selected ? 'bg-brand-soft' : active && 'bg-row-active')}
      />
    </div>
  );
}

function TopicRow({
  topic,
  dormant,
  now,
  today,
  showProject,
  onClick,
  onHover,
  dragProps,
  className,
}: RowProps & {
  onClick?: (event: MouseEvent) => void;
  onHover?: () => void;
  dragProps?: HTMLAttributes<HTMLAnchorElement>;
  className?: string;
}) {
  const { t } = useTranslation();
  const closed = isClosed(topic.status);
  const late = topic.dueDate !== null && !closed && diffDays(today, topic.dueDate) < 0;
  const idle = elapsedDays(topic.lastActivityAt, now);
  return (
    <Link
      to="/p/$key/sujets/$ref"
      params={{ key: topic.projectKey, ref: topic.ref }}
      data-topic-id={topic.id}
      {...dragProps}
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      className={cn(
        'flex min-h-9.5 touch-manipulation items-center gap-2.5 border-line border-b px-5 text-ink no-underline',
        className,
      )}
    >
      <PriorityIcon priority={topic.priority} labelled />
      <TopicRef className="min-w-13">{topic.ref}</TopicRef>
      <StatusIcon status={topic.status} labelled />
      <span className={cn('min-w-0 flex-auto truncate', closed && 'text-ink-4')}>{topic.title}</span>
      {dormant ? (
        <DormantBadge title={t('views.idleFor', { count: idle })} days={t('overview.idleDays', { count: idle })} />
      ) : null}
      {showProject ? (
        <span className="hidden shrink-0 rounded-full border border-border px-2 py-px text-ink-3 text-xs sm:inline">
          {topic.projectName}
        </span>
      ) : null}
      <span className="hidden shrink-0 gap-1.5 lg:flex">
        {topic.labels.map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
      </span>
      <span
        className={cn('w-14 shrink-0 text-right text-xs tabular-nums', late ? 'font-medium text-danger' : 'text-ink-3')}
      >
        {topic.dueDate ? formatShortDate(topic.dueDate) : null}
      </span>
      <span className="w-5 shrink-0">{topic.assignee ? <Avatar user={topic.assignee} /> : null}</span>
    </Link>
  );
}

const SELECTION_ACTIONS: Array<{ kind: PaletteField; key: string }> = [
  { kind: 'status', key: 'S' },
  { kind: 'priority', key: 'P' },
  { kind: 'labels', key: 'L' },
  { kind: 'subproject', key: 'M' },
  { kind: 'due', key: 'D' },
];

/** Floating bar while topics are selected: the same keys as on one topic, applied to all of them. */
function SelectionBar({
  count,
  onField,
  onClear,
}: {
  count: number;
  onField: (kind: PaletteField) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-label={t('selection.label')}
      className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-32px)] -translate-x-1/2 animate-dialog-in items-center gap-1 overflow-x-auto rounded-xl border border-popover-border bg-popover p-1.5 shadow-float md:left-[calc(50%+116px)]"
    >
      <span className="whitespace-nowrap px-2 font-medium tabular-nums">{t('selection.count', { count })}</span>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {SELECTION_ACTIONS.map(({ kind, key }) => (
        <Button key={kind} variant="ghost" size="sm" onClick={() => onField(kind)} className="gap-1.5 pr-1.5">
          {t(`selection.${kind}`)}
          <Kbd variant="outline">{key}</Kbd>
        </Button>
      ))}
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <Button variant="ghost" size="sm" onClick={onClear} className="gap-1.5 pr-1.5 text-ink-3">
        <XIcon className="size-3.5" aria-hidden />
        {t('selection.clear')}
        <Kbd variant="outline">{t('palette.escape')}</Kbd>
      </Button>
    </div>
  );
}

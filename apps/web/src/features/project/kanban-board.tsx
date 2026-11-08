import {
  diffDays,
  elapsedDays,
  isClosed,
  isDormant,
  KANBAN_STATUSES,
  sortKeyBetween,
  type TopicStatus,
  type TopicSummary,
} from '@cairn/shared';
import {
  closestCorners,
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from '@tanstack/react-router';
import { CalendarIcon, PlusIcon, SquareCheckIcon } from 'lucide-react';
import { forwardRef, type HTMLAttributes, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, DormantBadge, LabelChip } from '@/components/bits';
import { PriorityIcon, StatusIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { formatShortDate, todayISO } from '@/lib/format';
import { useUpdateTopic } from '@/lib/queries';
import { useTopicPanel } from '@/lib/topic-panel';
import { useUi } from '@/lib/ui-state';
import { cn } from '@/lib/utils';

const DONE_SHOWN = 3;
const COLUMN_PREFIX = 'column:';

const bySortOrder = (a: TopicSummary, b: TopicSummary) =>
  a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0;
const byCompletedDesc = (a: TopicSummary, b: TopicSummary) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '');

/**
 * Kanban by status. Dragging a card to another column changes its status;
 * dragging inside a column reorders it (fractional `sortOrder`). Done is
 * sorted by completion date, most recent first.
 */
export function KanbanBoard({
  topics,
  dormancyDays,
  createContext,
}: {
  topics: TopicSummary[];
  dormancyDays: number;
  createContext: { projectId?: string; subprojectId?: string | null };
}) {
  const { t } = useTranslation();
  const ui = useUi();
  const update = useUpdateTopic();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TopicStatus | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const lastDragEnd = useRef(0);
  const now = new Date();
  const today = todayISO();

  const columns = useMemo(
    () =>
      KANBAN_STATUSES.map((status) => ({
        status,
        topics: topics.filter((t) => t.status === status).sort(status === 'done' ? byCompletedDesc : bySortOrder),
      })),
    [topics],
  );
  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const active = activeId ? byId.get(activeId) : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter keeps opening the card; Space picks it up.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const statusOf = (id: string | number): TopicStatus | undefined => {
    const value = String(id);
    if (value.startsWith(COLUMN_PREFIX)) return value.slice(COLUMN_PREFIX.length) as TopicStatus;
    return byId.get(value)?.status;
  };

  const onDragStart = ({ active: a }: DragStartEvent) => setActiveId(String(a.id));
  const onDragOver = ({ over }: DragOverEvent) => setOverStatus(over ? (statusOf(over.id) ?? null) : null);
  const onDragCancel = () => {
    setActiveId(null);
    setOverStatus(null);
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    lastDragEnd.current = Date.now();
    setActiveId(null);
    setOverStatus(null);
    const topic = byId.get(String(a.id));
    const target = over ? statusOf(over.id) : undefined;
    if (!topic || !over || !target) return;

    const column = columns.find((c) => c.status === target)?.topics ?? [];
    const overIsColumn = String(over.id).startsWith(COLUMN_PREFIX);

    // Done is ordered by completion date: dropping there only changes the status.
    if (target === 'done') {
      if (topic.status !== 'done') update.mutate({ ref: topic.ref, patch: { status: 'done' } });
      return;
    }

    let previous: TopicSummary | undefined;
    let next: TopicSummary | undefined;
    if (topic.status === target) {
      const from = column.findIndex((c) => c.id === topic.id);
      const to = overIsColumn ? column.length - 1 : column.findIndex((c) => c.id === over.id);
      if (from === to || to < 0) return;
      const moved = arrayMove(column, from, to);
      previous = moved[to - 1];
      next = moved[to + 1];
    } else {
      const overIndex = overIsColumn ? column.length : column.findIndex((c) => c.id === over.id);
      const dragged = a.rect.current.translated;
      const below =
        !overIsColumn && dragged ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2 : false;
      const index = overIndex + (below ? 1 : 0);
      previous = column[index - 1];
      next = column[index];
    }

    let sortOrder: string | undefined;
    try {
      sortOrder = sortKeyBetween(previous?.sortOrder ?? null, next?.sortOrder ?? null);
    } catch {
      // Neighbours from different projects can share keys; keep the order as is.
      sortOrder = undefined;
    }
    const patch = { ...(topic.status === target ? {} : { status: target }), ...(sortOrder ? { sortOrder } : {}) };
    if (Object.keys(patch).length > 0) update.mutate({ ref: topic.ref, patch });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        className="flex flex-auto items-start gap-3 overflow-x-auto px-6 pt-1 pb-8"
        onClickCapture={(event) => {
          // A drop is not a click.
          if (Date.now() - lastDragEnd.current < 150) event.preventDefault();
        }}
      >
        {columns.map(({ status, topics: cards }) => {
          const hidden = status === 'done' && !showAllDone ? Math.max(0, cards.length - DONE_SHOWN) : 0;
          const visible = hidden > 0 ? cards.slice(0, DONE_SHOWN) : cards;
          return (
            <Column
              key={status}
              status={status}
              count={cards.length}
              highlighted={overStatus === status && active?.status !== status}
              onAdd={() => ui.openCreate({ ...createContext, status })}
              addLabel={t('views.addTopicIn', { name: t(`status.${status}`) })}
            >
              <SortableContext items={visible.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {visible.map((topic) => (
                  <SortableCard
                    key={topic.id}
                    topic={topic}
                    dormant={isDormant(topic, now, dormancyDays)}
                    now={now}
                    today={today}
                  />
                ))}
              </SortableContext>
              {hidden > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAllDone(true)}
                  className="border-0 bg-transparent px-2 py-1.5 text-left text-ink-3 text-xs hover:text-ink"
                >
                  {t('views.moreDone', { count: hidden })}
                </button>
              ) : null}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        {active ? (
          <Card
            topic={active}
            dormant={isDormant(active, now, dormancyDays)}
            now={now}
            today={today}
            className="rotate-[-1.5deg] cursor-grabbing border-brand shadow-drag"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  count,
  highlighted,
  onAdd,
  addLabel,
  children,
}: {
  status: TopicStatus;
  count: number;
  highlighted: boolean;
  onAdd: () => void;
  addLabel: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: `${COLUMN_PREFIX}${status}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={t(`status.${status}`)}
      className={cn(
        'box-border flex w-68 shrink-0 flex-col gap-2 rounded-[10px] border p-2 transition-colors duration-150',
        highlighted ? 'border-column-active-border bg-column-active' : 'border-transparent bg-column',
      )}
    >
      <div className="flex h-7.5 items-center gap-2 px-1">
        <StatusIcon status={status} />
        <h2 className="m-0 font-semibold text-sm">{t(`status.${status}`)}</h2>
        <span className="text-ink-4 text-xs tabular-nums">{count}</span>
        <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={addLabel} onClick={onAdd}>
          <PlusIcon className="size-3.5" strokeWidth={2} />
        </Button>
      </div>
      {children}
    </section>
  );
}

function SortableCard({
  topic,
  dormant,
  now,
  today,
}: {
  topic: TopicSummary;
  dormant: boolean;
  now: Date;
  today: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: topic.id });
  return (
    <Card
      ref={setNodeRef}
      topic={topic}
      dormant={dormant}
      now={now}
      today={today}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'border-input opacity-40 shadow-none')}
      {...attributes}
      {...listeners}
    />
  );
}

type CardProps = {
  topic: TopicSummary;
  dormant: boolean;
  now: Date;
  today: string;
} & HTMLAttributes<HTMLAnchorElement>;

const Card = forwardRef<HTMLAnchorElement, CardProps>(function Card(
  { topic, dormant, now, today, className, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const panel = useTopicPanel();
  const closed = isClosed(topic.status);
  const late = topic.dueDate !== null && !closed && diffDays(today, topic.dueDate) < 0;
  const idle = elapsedDays(topic.lastActivityAt, now);
  const chip =
    'inline-flex h-5 items-center gap-1 rounded-[5px] border border-border px-1.5 text-caption text-ink-2 tabular-nums';
  return (
    <Link
      ref={ref}
      to="/p/$key/sujets/$ref"
      params={{ key: topic.projectKey, ref: topic.ref }}
      className={cn(
        'flex touch-manipulation flex-col gap-2 rounded-lg border border-border bg-card px-3 pt-2.5 pb-[11px] text-ink no-underline shadow-card outline-offset-2',
        topic.ref === panel.current && 'border-brand',
        className,
      )}
      {...rest}
      onClick={panel.onLinkClick(topic)}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-caption text-ink-4">{topic.ref}</span>
        {dormant ? (
          <DormantBadge title={t('views.idleFor', { count: idle })} days={t('overview.idleDays', { count: idle })} />
        ) : null}
        {topic.assignee ? <Avatar user={topic.assignee} className="ml-auto" /> : null}
      </div>
      <div className={cn('font-medium leading-[1.4]', closed && 'text-ink-4')}>{topic.title}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {topic.priority !== 'none' ? (
          <span className="inline-grid h-5 w-[22px] place-items-center rounded-[5px] border border-border">
            <PriorityIcon priority={topic.priority} labelled className="size-3" />
          </span>
        ) : null}
        {topic.dueDate && !closed ? (
          <span className={cn(chip, late && 'border-danger-border text-danger')}>
            <CalendarIcon className="size-[11px]" strokeWidth={2.2} aria-hidden />
            {formatShortDate(topic.dueDate)}
          </span>
        ) : null}
        {topic.checklist.total > 0 && !closed ? (
          <span className={chip}>
            <SquareCheckIcon className="size-[11px]" strokeWidth={2.2} aria-hidden />
            {topic.checklist.done}/{topic.checklist.total}
          </span>
        ) : null}
        {topic.status === 'waiting' && topic.waitingSince ? (
          <span className="text-caption text-dormant">
            {t('views.waitingFor', { count: elapsedDays(topic.waitingSince, now) })}
          </span>
        ) : null}
        {topic.labels.map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
      </div>
    </Link>
  );
});

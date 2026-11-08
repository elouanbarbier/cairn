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
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Count, DormantBadge, EmptyState, LabelChip, ProgressBar, TopicRef } from '@/components/bits';
import { PriorityIcon, StatusIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { formatShortDate, todayISO } from '@/lib/format';
import { useHotkeys } from '@/lib/hotkeys';
import { type CreateContext, useUi } from '@/lib/ui-state';
import { cn } from '@/lib/utils';
import type { GroupBy } from '@/router';
import { LIST_STATUS_ORDER } from './filters';

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
  groups.push({
    key: 'none',
    title: noSubprojectLabel,
    topics: visible.filter((t) => t.subprojectId === null).sort(byListOrder),
    all: all.filter((t) => t.subprojectId === null),
    createContext: { subprojectId: null },
  });
  return groups.filter((g) => g.topics.length > 0 || (g.key !== 'none' && g.all.length === 0));
}

/**
 * Grouped topic list. Keyboard: J/K move, Enter opens, S/P change status or
 * priority of the highlighted topic.
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
}) {
  const { t } = useTranslation();
  const ui = useUi();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const today = todayISO();

  const groups = useMemo(
    () => buildGroups(topics, allTopics, group, project, t('views.noSubproject'), (s) => t(`status.${s}`)),
    [topics, allTopics, group, project, t],
  );
  const flat = groups.filter((g) => !collapsed.includes(g.key)).flatMap((g) => g.topics);
  const active = flat.find((t) => t.id === activeId);

  useEffect(() => {
    if (!activeId) return;
    listRef.current?.querySelector(`[data-topic-id="${activeId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const move = (delta: number) => {
    const index = flat.findIndex((t) => t.id === activeId);
    const next = flat[Math.max(0, Math.min(flat.length - 1, index === -1 ? 0 : index + delta))];
    if (next) setActiveId(next.id);
  };

  useHotkeys({
    j: () => move(1),
    k: () => move(-1),
    arrowdown: () => move(1),
    arrowup: () => move(-1),
    enter: (event) => {
      // Let focused links and buttons elsewhere handle their own Enter.
      const target = event.target as Node;
      if (!active || (target !== document.body && !listRef.current?.contains(target))) return false;
      void navigate({ to: '/p/$key/sujets/$ref', params: { key: active.projectKey, ref: active.ref } });
    },
    s: () => {
      if (!active) return false;
      ui.openPalette({ kind: 'status', ref: active.ref });
    },
    p: () => {
      if (!active) return false;
      ui.openPalette({ kind: 'priority', ref: active.ref });
    },
  });

  if (groups.length === 0) return <EmptyState>{emptyLabel}</EmptyState>;

  return (
    <div ref={listRef} className="flex flex-col pb-8">
      {groups.map((g) => {
        const isCollapsed = collapsed.includes(g.key);
        const progress = computeProgress(g.all.map((x) => x.status));
        const open = g.all.filter((x) => !isClosed(x.status)).length;
        return (
          <section key={g.key} aria-label={typeof g.title === 'string' ? g.title : undefined}>
            <div className="sticky top-0 z-10 flex h-9.5 items-center gap-2.5 border-border/70 border-b bg-subtle px-5">
              <button
                type="button"
                onClick={() => setCollapsed((c) => (isCollapsed ? c.filter((k) => k !== g.key) : [...c, g.key]))}
                aria-expanded={!isCollapsed}
                aria-label={t(isCollapsed ? 'views.expandGroup' : 'views.collapseGroup', {
                  name: typeof g.title === 'string' ? g.title : '',
                })}
                className="grid size-5 place-items-center rounded border-0 bg-transparent p-0 text-ink-4 hover:text-ink"
              >
                {isCollapsed ? (
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
              {group === 'subproject' ? (
                <span className="ml-2 hidden items-center gap-2 text-ink-4 text-xs tabular-nums sm:inline-flex">
                  <ProgressBar progress={progress} height={4} className="w-14 bg-border" />
                  {progress.done}/{progress.total}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
                aria-label={t('views.addTopicTo', { name: typeof g.title === 'string' ? g.title : '' })}
                onClick={() => ui.openCreate({ projectId: project?.id, ...createContext, ...g.createContext })}
              >
                <PlusIcon className="size-3.5" strokeWidth={2} />
              </Button>
            </div>
            {isCollapsed
              ? null
              : g.topics.map((topic) => (
                  <TopicRow
                    key={topic.id}
                    topic={topic}
                    active={topic.id === activeId}
                    onHover={() => setActiveId(topic.id)}
                    dormant={isDormant(topic, now, dormancyDays)}
                    now={now}
                    today={today}
                    showProject={showProject}
                  />
                ))}
          </section>
        );
      })}
    </div>
  );
}

function TopicRow({
  topic,
  active,
  onHover,
  dormant,
  now,
  today,
  showProject,
}: {
  topic: TopicSummary;
  active: boolean;
  onHover: () => void;
  dormant: boolean;
  now: Date;
  today: string;
  showProject: boolean;
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
      onMouseEnter={onHover}
      onFocus={onHover}
      className={cn(
        'flex min-h-9.5 items-center gap-2.5 border-line border-b px-5 text-ink no-underline',
        active && 'bg-row-active',
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
      <span className="w-5 shrink-0">
        {topic.assignee ? <Avatar user={topic.assignee} className={cn(closed && 'opacity-50')} /> : null}
      </span>
    </Link>
  );
}

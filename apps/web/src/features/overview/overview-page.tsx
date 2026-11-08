import { diffDays, elapsedDays, type Overview, type RecentActivity, type TopicSummary } from '@cairn/shared';
import { Link } from '@tanstack/react-router';
import {
  CalendarIcon,
  ChartNoAxesColumnIcon,
  FolderPlusIcon,
  HistoryIcon,
  ListFilterIcon,
  MoonIcon,
  SparklesIcon,
} from 'lucide-react';
import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ActivityItem } from '@/components/activity-item';
import { ColorSquare, Count, DormantBadge, LoadError, Panel, ProgressBar, TopicRef } from '@/components/bits';
import { PriorityIcon, StatusIcon } from '@/components/icons';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { formatLongDate, formatShortDate, formatWeekday, formatWeekdayDate, todayISO } from '@/lib/format';
import { useMe, useOverview, useProjects } from '@/lib/queries';
import { useTopicPanel } from '@/lib/topic-panel';
import { useUi } from '@/lib/ui-state';
import { cn, firstName } from '@/lib/utils';

const HIDDEN_KEY = 'cairn.overview.hiddenProjects';
const IN_PROGRESS_PER_PROJECT = 5;
const COMPLETED_SHOWN = 4;

function readHidden(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Drops topics of projects hidden by the filter. */
function filterOverview(overview: Overview, hidden: string[]): Overview {
  if (hidden.length === 0) return overview;
  const keep = (t: TopicSummary) => !hidden.includes(t.projectId);
  return {
    ...overview,
    activeProjectCount: overview.progress.filter((p) => !hidden.includes(p.project.id)).length,
    inProgress: overview.inProgress.filter((g) => !hidden.includes(g.project.id)),
    waiting: overview.waiting.filter(keep),
    overdue: overview.overdue.filter(keep),
    upcoming: overview.upcoming.filter(keep),
    dormant: overview.dormant.filter(keep),
    progress: overview.progress.filter((p) => !hidden.includes(p.project.id)),
    completedThisWeek: overview.completedThisWeek.filter(keep),
    recentActivity: overview.recentActivity.filter((a) => !hidden.includes(a.project.id)),
  };
}

export function OverviewPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const overview = useOverview();
  const me = useMe();
  const projects = useProjects();
  const noProjects = projects.data?.length === 0;
  const [hidden, setHidden] = useState<string[]>(readHidden);
  const now = new Date();
  const today = todayISO();

  useEffect(() => ui.setScreenContext({}), [ui.setScreenContext]);

  const toggleProject = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      // Not persisted.
    }
  };

  const data = useMemo(
    () => (overview.data ? filterOverview(overview.data, hidden) : undefined),
    [overview.data, hidden],
  );
  const hour = now.getHours();
  const greetingKey = hour >= 18 || hour < 5 ? 'overview.greetingEvening' : 'overview.greetingMorning';

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button variant="outline" onClick={() => toast(t('overview.synthesisSoon'))}>
              <SparklesIcon className="size-[15px]" strokeWidth={1.75} />
              {t('overview.synthesis')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={cn(hidden.length > 0 && 'border-brand text-brand')}>
                  <ListFilterIcon className="size-[15px]" strokeWidth={1.75} />
                  {t('overview.filter')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t('overview.filterProjects')}</DropdownMenuLabel>
                {overview.data?.progress.map(({ project }) => (
                  <DropdownMenuCheckboxItem
                    key={project.id}
                    checked={!hidden.includes(project.id)}
                    onCheckedChange={() => toggleProject(project.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <ColorSquare color={project.color} />
                    {project.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {noProjects ? null : (
              <Button onClick={() => ui.openCreate({})} className="pr-2">
                {t('nav.newTopic')}
                <Kbd variant="inverse">C</Kbd>
              </Button>
            )}
          </>
        }
      >
        <span className="font-medium">{t('overview.title')}</span>
        <span className="text-ink-4">{formatLongDate(today)}</span>
      </PageHeader>

      <div className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-6 px-4 pt-7 pb-12 sm:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-semibold text-2xl tracking-[-0.02em]">
            {t(greetingKey, { name: me.data ? firstName(me.data.user.name) : '' })}
          </h1>
          {data && !noProjects ? (
            <p className="m-0 text-ink-3">{t('overview.subtitle', { count: data.activeProjectCount })}</p>
          ) : null}
        </div>

        {overview.isError ? <LoadError onRetry={() => void overview.refetch()} /> : null}
        {noProjects ? (
          <FirstProject onCreate={() => ui.setProjectDialogOpen(true)} />
        ) : data ? (
          <OverviewContent data={data} now={now} />
        ) : overview.isPending ? (
          <OverviewSkeleton />
        ) : null}
      </div>
    </>
  );
}

/** Empty workspace: the overview invites to create the first project. */
function FirstProject({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="first-project"
      className="flex flex-col items-start gap-3 rounded-xl border border-border border-dashed bg-card px-6 py-8 sm:px-8"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
        <FolderPlusIcon className="size-[18px]" strokeWidth={1.9} aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <h2 id="first-project" className="m-0 font-semibold text-lg">
          {t('overview.empty.noProjectsTitle')}
        </h2>
        <p className="m-0 max-w-[520px] text-ink-3">{t('overview.empty.noProjects')}</p>
      </div>
      <Button onClick={onCreate} className="pr-2">
        {t('overview.empty.createProject')}
        <Kbd variant="inverse">⇧P</Kbd>
      </Button>
    </section>
  );
}

function scrollTo(id: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function StatCard({
  id,
  icon,
  label,
  value,
  hint,
  danger,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
  danger?: boolean;
}) {
  return (
    <a
      href={`#${id}`}
      onClick={scrollTo(id)}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border px-4 py-3.5 text-ink no-underline transition-colors duration-150',
        danger ? 'border-danger-border bg-danger-soft' : 'border-border bg-card hover:bg-subtle',
      )}
    >
      <span className={cn('flex items-center gap-2 font-medium', danger ? 'text-danger' : 'text-ink-3')}>
        {icon}
        {label}
      </span>
      <span className={cn('font-semibold text-stat tabular-nums tracking-[-0.02em]', danger && 'text-danger')}>
        {value}
      </span>
      <span className={cn('text-xs', danger ? 'text-danger-strong' : 'text-ink-4')}>{hint}</span>
    </a>
  );
}

const rowClass =
  'flex min-h-9 items-center gap-2.5 border-line border-t px-4 text-ink no-underline transition-colors duration-150 hover:bg-row-active';

function TopicLink({ topic, className, children }: { topic: TopicSummary; className?: string; children: ReactNode }) {
  const panel = useTopicPanel();
  return (
    <Link
      to="/p/$key/sujets/$ref"
      params={{ key: topic.projectKey, ref: topic.ref }}
      onClick={panel.onLinkClick(topic)}
      className={cn(rowClass, topic.ref === panel.current && 'bg-row-active', className)}
    >
      {children}
    </Link>
  );
}

/** Where a recent change happened: the topic (opens in the panel), or the project. */
function ActivityTarget({ entry }: { entry: RecentActivity }) {
  const panel = useTopicPanel();
  const ref = entry.topicRef;
  const project = entry.project;
  return (
    <>
      {' · '}
      {ref ? (
        <Link
          to="/p/$key/sujets/$ref"
          params={{ key: project.key, ref }}
          onClick={panel.onLinkClick({ projectKey: project.key, ref })}
          className="text-ink-2 no-underline hover:underline"
        >
          <span className="font-mono text-caption">{ref}</span> {entry.topicTitle}
        </Link>
      ) : (
        <Link
          to="/p/$key"
          params={{ key: project.key }}
          className="inline-flex items-center gap-1.5 text-ink-2 no-underline hover:underline"
        >
          <ColorSquare color={project.color} />
          {project.name}
        </Link>
      )}
    </>
  );
}

function Title({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('min-w-0 flex-auto truncate', className)}>{children}</span>;
}

function GroupRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-7.5 items-center gap-2 border-line border-t bg-subtle px-4 font-medium text-ink-2 text-xs',
        className,
      )}
    >
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 border-line border-t px-4 py-3 text-ink-4 text-xs">{children}</p>;
}

function OverviewContent({ data, now }: { data: Overview; now: Date }) {
  const { t } = useTranslation();
  const [showAllInProgress, setShowAllInProgress] = useState(false);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const inProgressCount = data.inProgress.reduce((n, g) => n + g.topics.length, 0);
  const truncated = data.inProgress.some((g) => g.topics.length > IN_PROGRESS_PER_PROJECT);
  const oldestWaiting = data.waiting[0];
  const oldestWaitingDays = oldestWaiting
    ? elapsedDays(oldestWaiting.waitingSince ?? oldestWaiting.lastActivityAt, now)
    : 0;
  const deadlineCount = data.overdue.length + data.upcoming.length;
  const moreCompleted = data.completedThisWeek.length - COMPLETED_SHOWN;

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <StatCard
          id="en-cours"
          icon={<StatusIcon status="in_progress" />}
          label={t('overview.stats.inProgress')}
          value={inProgressCount}
          hint={t('overview.stats.inProgressHint', { count: data.inProgress.length })}
        />
        <StatCard
          id="en-attente"
          icon={<StatusIcon status="waiting" />}
          label={t('overview.stats.waiting')}
          value={data.waiting.length}
          hint={
            oldestWaiting
              ? t('overview.stats.waitingHint', { count: oldestWaitingDays })
              : t('overview.stats.waitingNone')
          }
        />
        <StatCard
          id="echeances"
          icon={<CalendarIcon className="size-3.5" strokeWidth={2} aria-hidden />}
          label={t('overview.stats.overdue')}
          value={data.overdue.length}
          hint={t('overview.stats.overdueHint', { count: data.upcoming.length })}
          danger={data.overdue.length > 0}
        />
        <StatCard
          id="dormants"
          icon={<MoonIcon className="size-3.5" strokeWidth={2} aria-hidden />}
          label={t('overview.stats.dormant')}
          value={data.dormant.length}
          hint={t('overview.stats.dormantHint', { count: data.dormancyDays })}
        />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-4">
          <Panel
            id="en-cours"
            title={t('overview.inProgress')}
            icon={<StatusIcon status="in_progress" />}
            count={inProgressCount}
            action={
              truncated ? (
                <button
                  type="button"
                  onClick={() => setShowAllInProgress((v) => !v)}
                  className="border-0 bg-transparent p-0 text-ink-3 text-xs hover:text-ink"
                >
                  {t('overview.seeAll')}
                </button>
              ) : undefined
            }
          >
            {data.inProgress.length === 0 ? <Empty>{t('overview.empty.inProgress')}</Empty> : null}
            {data.inProgress.map((group) => (
              <div key={group.project.id}>
                <GroupRow>
                  <ColorSquare color={group.project.color} />
                  {group.project.name}
                  <Count>{group.topics.length}</Count>
                </GroupRow>
                {(showAllInProgress ? group.topics : group.topics.slice(0, IN_PROGRESS_PER_PROJECT)).map((topic) => (
                  <TopicLink key={topic.id} topic={topic}>
                    <PriorityIcon priority={topic.priority} labelled />
                    <TopicRef className="min-w-14">{topic.ref}</TopicRef>
                    <Title>{topic.title}</Title>
                    {topic.subprojectName ? (
                      <span className="hidden shrink-0 rounded-full border border-border px-2 py-px text-ink-3 text-xs sm:inline">
                        {topic.subprojectName}
                      </span>
                    ) : null}
                    <span className="w-13 shrink-0 text-right text-ink-3 text-xs tabular-nums">
                      {topic.dueDate ? formatShortDate(topic.dueDate) : '—'}
                    </span>
                  </TopicLink>
                ))}
              </div>
            ))}
          </Panel>

          <Panel
            id="echeances"
            title={t('overview.deadlines')}
            icon={<CalendarIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />}
            count={deadlineCount}
          >
            {deadlineCount === 0 ? <Empty>{t('overview.empty.deadlines')}</Empty> : null}
            {data.overdue.length > 0 ? (
              <>
                <GroupRow className="border-danger-line bg-danger-soft text-danger">
                  {t('overview.overdue')}
                  <span className="font-normal tabular-nums">{data.overdue.length}</span>
                </GroupRow>
                {data.overdue.map((topic) => (
                  <TopicLink key={topic.id} topic={topic}>
                    <PriorityIcon priority={topic.priority} labelled />
                    <TopicRef className="min-w-14">{topic.ref}</TopicRef>
                    <StatusIcon status={topic.status} labelled />
                    <Title>{topic.title}</Title>
                    <span className="hidden shrink-0 text-danger text-xs tabular-nums sm:inline">
                      {t('overview.daysLate', { count: diffDays(topic.dueDate ?? data.today, data.today) })}
                    </span>
                    <span className="w-19 shrink-0 text-right font-medium text-danger text-xs tabular-nums">
                      {topic.dueDate ? formatWeekdayDate(topic.dueDate) : null}
                    </span>
                  </TopicLink>
                ))}
              </>
            ) : null}
            {data.upcoming.length > 0 ? (
              <>
                <GroupRow>
                  {t('overview.next7Days')}
                  <Count>{data.upcoming.length}</Count>
                </GroupRow>
                {data.upcoming.map((topic) => (
                  <TopicLink key={topic.id} topic={topic}>
                    <PriorityIcon priority={topic.priority} labelled />
                    <TopicRef className="min-w-14">{topic.ref}</TopicRef>
                    <StatusIcon status={topic.status} labelled />
                    <Title>{topic.title}</Title>
                    <span className="w-19 shrink-0 text-right text-ink-3 text-xs tabular-nums">
                      {topic.dueDate ? formatWeekdayDate(topic.dueDate) : null}
                    </span>
                  </TopicLink>
                ))}
              </>
            ) : null}
          </Panel>
          <Panel
            id="activite"
            title={t('overview.recentActivity')}
            icon={<HistoryIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />}
          >
            {data.recentActivity.length === 0 ? <Empty>{t('overview.empty.recentActivity')}</Empty> : null}
            {data.recentActivity.length > 0 ? (
              <ol className="m-0 flex list-none flex-col gap-2.5 border-line border-t px-4 py-3 text-ink-3 text-small">
                {data.recentActivity.map((entry) => (
                  <ActivityItem key={entry.id} entry={entry} withTime suffix={<ActivityTarget entry={entry} />} />
                ))}
              </ol>
            ) : null}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Panel
            id="dormants"
            title={t('overview.dormant')}
            icon={<MoonIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />}
            count={data.dormant.length}
            hint={t('overview.dormantHint', { count: data.dormancyDays })}
          >
            {data.dormant.length === 0 ? <Empty>{t('overview.empty.dormant')}</Empty> : null}
            {data.dormant.map((topic) => (
              <TopicLink key={topic.id} topic={topic}>
                <StatusIcon status={topic.status} labelled />
                <TopicRef className="min-w-13">{topic.ref}</TopicRef>
                <Title>{topic.title}</Title>
                <DormantBadge
                  icon={false}
                  days={t('overview.idleDays', { count: elapsedDays(topic.lastActivityAt, now) })}
                />
              </TopicLink>
            ))}
          </Panel>

          <Panel
            id="en-attente"
            title={t('overview.waiting')}
            icon={<StatusIcon status="waiting" />}
            count={data.waiting.length}
          >
            {data.waiting.length === 0 ? <Empty>{t('overview.empty.waiting')}</Empty> : null}
            {data.waiting.map((topic) => (
              <TopicLink key={topic.id} topic={topic}>
                <TopicRef className="min-w-13">{topic.ref}</TopicRef>
                <Title>{topic.title}</Title>
                <span className="shrink-0 text-ink-4 text-xs tabular-nums">
                  {t('overview.waitingSince', { count: elapsedDays(topic.waitingSince ?? topic.lastActivityAt, now) })}
                </span>
              </TopicLink>
            ))}
          </Panel>

          <Panel
            title={t('overview.progress')}
            icon={<ChartNoAxesColumnIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />}
          >
            {data.progress.length === 0 ? <Empty>{t('overview.empty.progress')}</Empty> : null}
            {data.progress.map(({ project, progress, subprojects }) => {
              const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
              return (
                <div key={project.id} className="flex flex-col gap-2 border-line border-t px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ColorSquare color={project.color} />
                    <Link
                      to="/p/$key"
                      params={{ key: project.key }}
                      className="font-medium text-ink no-underline hover:underline"
                    >
                      {project.name}
                    </Link>
                    <span className="ml-auto text-ink-3 text-xs tabular-nums">
                      {progress.done}/{progress.total} · {pct} %
                    </span>
                  </div>
                  <ProgressBar progress={progress} color={project.color} />
                  {subprojects.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2.5 text-ink-3 text-xs">
                      <span className="min-w-0 flex-auto truncate">{sub.name}</span>
                      <ProgressBar progress={sub.progress} height={4} tone="neutral" className="w-18 shrink-0" />
                      <span className="w-9 shrink-0 text-right tabular-nums">
                        {sub.progress.done}/{sub.progress.total}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </Panel>

          <Panel
            title={t('overview.completed')}
            icon={<StatusIcon status="done" />}
            count={data.completedThisWeek.length}
          >
            {data.completedThisWeek.length === 0 ? <Empty>{t('overview.empty.completed')}</Empty> : null}
            {(showAllCompleted ? data.completedThisWeek : data.completedThisWeek.slice(0, COMPLETED_SHOWN)).map(
              (topic) => (
                <TopicLink key={topic.id} topic={topic} className="min-h-8.5 text-ink-3">
                  <TopicRef className="min-w-13">{topic.ref}</TopicRef>
                  <Title>{topic.title}</Title>
                  <span className="shrink-0 text-ink-4 text-xs">
                    {topic.completedAt ? formatWeekday(topic.completedAt) : null}
                  </span>
                </TopicLink>
              ),
            )}
            {moreCompleted > 0 && !showAllCompleted ? (
              <button
                type="button"
                onClick={() => setShowAllCompleted(true)}
                className="block w-full border-0 border-line border-t bg-transparent px-4 pt-2 pb-2.5 text-left text-ink-3 text-xs hover:text-ink"
              >
                {t('overview.moreCompleted', { count: moreCompleted })}
              </button>
            ) : null}
          </Panel>
        </div>
      </div>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[90px] animate-pulse rounded-lg border border-border bg-subtle" />
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="h-[340px] flex-[2_1_520px] animate-pulse rounded-lg border border-border bg-subtle" />
        <div className="h-[340px] flex-[1_1_320px] animate-pulse rounded-lg border border-border bg-subtle" />
      </div>
    </div>
  );
}

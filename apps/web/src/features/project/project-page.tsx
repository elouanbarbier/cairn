import {
  DEFAULT_DORMANCY_DAYS,
  isClosed,
  type ProjectStatus,
  type ProjectSummary,
  type TopicSummary,
} from '@cairn/shared';
import { Link } from '@tanstack/react-router';
import { EllipsisIcon, LayersIcon, LinkIcon } from 'lucide-react';
import { type ReactNode, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ActivityItem } from '@/components/activity-item';
import { ColorSquare, EmptyState, LoadError, ProgressBar } from '@/components/bits';
import { Breadcrumb, PageHeader } from '@/components/layout/page-header';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { formatShortDate } from '@/lib/format';
import { useMe, useProjectActivity, useProjects, useTopics } from '@/lib/queries';
import { useUi } from '@/lib/ui-state';
import { cn } from '@/lib/utils';
import { type ProjectTab, projectRoute, subprojectRoute, type ViewSearch } from '@/router';
import { filterTopics, hasFilters, parseFilters } from './filters';
import { KanbanBoard } from './kanban-board';
import { TopicList } from './topic-list';
import { FilterMenu, GroupMenu, ViewSwitch } from './view-controls';

function useProject(key: string) {
  const projects = useProjects();
  const project = projects.data?.find((p) => p.key === key.toUpperCase());
  return { projects, project };
}

function NewTopicButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button onClick={onClick} className="pr-2">
      {t('nav.newTopic')}
      <Kbd variant="inverse">C</Kbd>
    </Button>
  );
}

function ShownCount({ topics }: { topics: TopicSummary[] }) {
  const { t } = useTranslation();
  const closed = topics.filter((x) => isClosed(x.status)).length;
  return (
    <span className="ml-auto text-ink-4 text-xs">
      {t('views.shown', {
        open: t('views.openCount', { count: topics.length - closed }),
        closed: t('views.closedCount', { count: closed }),
      })}
    </span>
  );
}

const STATUS_PILL: Record<ProjectStatus, { pill: string; dot: string }> = {
  active: { pill: 'bg-success-soft text-success', dot: 'bg-success-dot' },
  paused: { pill: 'bg-muted text-ink-3', dot: 'bg-ink-5' },
  completed: { pill: 'bg-brand-soft text-brand', dot: 'bg-brand' },
  archived: { pill: 'bg-muted text-ink-4', dot: 'bg-ink-5' },
};

function Meta({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="font-medium text-caption text-ink-4">{label}</span>
      <span className="flex h-6 items-center">{children}</span>
    </div>
  );
}

function copyLink(t: (key: 'topic.linkCopied') => string) {
  void navigator.clipboard?.writeText(window.location.href).then(() => toast.success(t('topic.linkCopied')));
}

/* ---------------------------------- Project ---------------------------------- */

export function ProjectPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const { key } = projectRoute.useParams();
  const search = projectRoute.useSearch();
  const { projects, project } = useProject(key);
  const topics = useTopics({ project: key.toUpperCase() }, Boolean(project));
  const me = useMe();
  const tab: ProjectTab = search.tab ?? 'topics';

  useEffect(() => {
    if (project) ui.setScreenContext({ projectId: project.id, projectName: project.name });
  }, [project, ui.setScreenContext]);

  if (projects.isError) return <LoadError onRetry={() => void projects.refetch()} />;
  if (!project) return projects.isPending ? null : <EmptyState>{t('project.notFound')}</EmptyState>;

  const tabs: Array<{ id: ProjectTab; label: string; count?: number }> = [
    { id: 'topics', label: t('project.tabs.topics'), count: project.openCount },
    { id: 'subprojects', label: t('project.tabs.subprojects'), count: project.subprojects.length },
    { id: 'notes', label: t('project.tabs.notes') },
    { id: 'activity', label: t('project.tabs.activity') },
  ];

  return (
    <>
      <PageHeader
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={t('project.moreActions')}>
                  <EllipsisIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => copyLink(t)}>
                  <LinkIcon className="size-3.5" aria-hidden />
                  {t('topic.copyLink')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <NewTopicButton onClick={() => ui.openCreate({ projectId: project.id })} />
          </>
        }
      >
        <Breadcrumb items={[{ label: t('project.breadcrumbRoot'), link: { to: '/' } }, { label: project.name }]} />
      </PageHeader>

      <div className="flex flex-col gap-4.5 border-border border-b px-4 pt-6 sm:px-8">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="flex flex-[1_1_360px] items-start gap-3.5">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-lg"
              style={{ background: `color-mix(in srgb, ${project.color} 14%, transparent)`, color: project.color }}
            >
              <LayersIcon className="size-[18px]" strokeWidth={1.9} aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <h1 className="m-0 font-semibold text-xl tracking-[-0.02em]">{project.name}</h1>
                <span className="rounded bg-muted px-1.5 py-px font-mono text-caption text-ink-3">{project.key}</span>
              </div>
              {project.description ? <p className="m-0 max-w-[620px] text-ink-3">{project.description}</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-6">
            <Meta label={t('project.status')}>
              <span
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-full px-2 font-medium text-xs',
                  STATUS_PILL[project.status].pill,
                )}
              >
                <span className={cn('size-1.5 rounded-full', STATUS_PILL[project.status].dot)} aria-hidden />
                {t(`projectStatus.${project.status}`)}
              </span>
            </Meta>
            <Meta label={t('project.target')}>
              <span className="font-medium">
                {project.targetDate ? formatShortDate(project.targetDate) : t('project.none')}
              </span>
            </Meta>
            <Meta label={t('project.progress')} className="min-w-45">
              <span className="flex w-full items-center gap-2.5">
                <ProgressBar progress={project.progress} className="flex-auto" />
                <span className="text-ink-3 text-xs tabular-nums">
                  {project.progress.done}/{project.progress.total}
                </span>
              </span>
            </Meta>
          </div>
        </div>
        <nav aria-label={t('project.tabsLabel')} className="flex gap-5 overflow-x-auto">
          {tabs.map((item) => (
            <Link
              key={item.id}
              to="."
              search={(prev: ViewSearch) => ({ ...prev, tab: item.id === 'topics' ? undefined : item.id })}
              aria-current={tab === item.id ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 whitespace-nowrap text-ink-3 no-underline transition-colors duration-150 hover:text-ink',
                tab === item.id && 'font-medium text-ink shadow-[inset_0_-2px_0_var(--brand)]',
              )}
            >
              {item.label}
              {item.count === undefined ? null : <span className="font-normal text-ink-4 text-xs">{item.count}</span>}
            </Link>
          ))}
        </nav>
      </div>

      {tab === 'topics' ? (
        <ProjectTopics
          project={project}
          topics={topics.data}
          error={topics.isError}
          retry={() => void topics.refetch()}
          search={search}
          dormancyDays={me.data?.dormancyDays ?? DEFAULT_DORMANCY_DAYS}
        />
      ) : null}
      {tab === 'subprojects' ? <SubprojectCards project={project} /> : null}
      {tab === 'notes' ? (
        <div className="max-w-[760px] px-4 py-6 text-base text-ink-body sm:px-8">
          {project.description ? (
            <Markdown source={project.description} className="flex flex-col gap-2.5" />
          ) : (
            <EmptyState>{t('project.notesEmpty')}</EmptyState>
          )}
        </div>
      ) : null}
      {tab === 'activity' ? <ProjectActivity projectKey={project.key} /> : null}
    </>
  );
}

function ProjectTopics({
  project,
  topics,
  error,
  retry,
  search,
  dormancyDays,
}: {
  project: ProjectSummary;
  topics: TopicSummary[] | undefined;
  error: boolean;
  retry: () => void;
  search: ViewSearch;
  dormancyDays: number;
}) {
  const { t } = useTranslation();
  const view = search.view ?? 'list';
  const group = search.group ?? 'subproject';
  const filters = parseFilters(search);
  const visible = useMemo(
    () => filterTopics(topics ?? [], filters, new Date(), { recentClosedOnly: view === 'list' }),
    [topics, filters, view],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-border border-b px-5 py-2.5">
        <ViewSwitch view={view} />
        <FilterMenu filters={filters} />
        {view === 'list' ? <GroupMenu group={group} /> : null}
        <ShownCount topics={visible} />
      </div>
      {error ? <LoadError onRetry={retry} /> : null}
      {topics ? (
        view === 'list' ? (
          <TopicList
            topics={visible}
            allTopics={topics}
            group={group}
            project={project}
            dormancyDays={dormancyDays}
            emptyLabel={hasFilters(filters) ? t('views.emptyFiltered') : t('views.empty')}
          />
        ) : (
          <div className="flex flex-auto flex-col pt-3">
            <KanbanBoard topics={visible} dormancyDays={dormancyDays} createContext={{ projectId: project.id }} />
          </div>
        )
      ) : null}
    </>
  );
}

function SubprojectCards({ project }: { project: ProjectSummary }) {
  const { t } = useTranslation();
  if (project.subprojects.length === 0) return <EmptyState>{t('project.subprojectsEmpty')}</EmptyState>;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 px-4 py-6 sm:px-8">
      {project.subprojects.map((sub) => (
        <Link
          key={sub.id}
          to="/p/$key/s/$subprojectId"
          params={{ key: project.key, subprojectId: sub.id }}
          className="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-4 py-3.5 text-ink no-underline transition-colors duration-150 hover:bg-subtle"
        >
          <span className="font-semibold">{sub.name}</span>
          {sub.description ? <span className="line-clamp-2 text-ink-3 text-xs">{sub.description}</span> : null}
          <ProgressBar progress={sub.progress} />
          <span className="flex items-center justify-between text-ink-4 text-xs tabular-nums">
            <span>{t('project.openTopics', { count: sub.openCount })}</span>
            <span>
              {sub.progress.done}/{sub.progress.total}
              {sub.targetDate ? ` · ${formatShortDate(sub.targetDate)}` : ''}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function ProjectActivity({ projectKey }: { projectKey: string }) {
  const { t } = useTranslation();
  const activity = useProjectActivity(projectKey);
  if (activity.isError) return <LoadError onRetry={() => void activity.refetch()} />;
  if (!activity.data) return null;
  if (activity.data.length === 0) return <EmptyState>{t('project.activityEmpty')}</EmptyState>;
  return (
    <ol className="m-0 flex max-w-[860px] list-none flex-col gap-3 px-4 py-6 text-ink-3 text-small sm:px-8">
      {activity.data.map((entry) => (
        <ActivityItem
          key={entry.id}
          entry={entry}
          suffix={
            entry.topicRef ? (
              <>
                {' · '}
                <Link
                  to="/p/$key/sujets/$ref"
                  params={{ key: projectKey, ref: entry.topicRef }}
                  className="text-ink-2 no-underline hover:underline"
                >
                  <span className="font-mono text-caption">{entry.topicRef}</span> {entry.topicTitle}
                </Link>
              </>
            ) : null
          }
        />
      ))}
    </ol>
  );
}

/* --------------------------------- Subproject --------------------------------- */

export function SubprojectPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const { key, subprojectId } = subprojectRoute.useParams();
  const search = subprojectRoute.useSearch();
  const { projects, project } = useProject(key);
  const subproject = project?.subprojects.find((s) => s.id === subprojectId);
  const topics = useTopics({ subproject: subprojectId }, Boolean(subproject));
  const me = useMe();
  const view = search.view ?? 'kanban';
  const filters = parseFilters(search);
  const visible = useMemo(
    () => filterTopics(topics.data ?? [], filters, new Date(), { recentClosedOnly: view === 'list' }),
    [topics.data, filters, view],
  );
  const dormancyDays = me.data?.dormancyDays ?? DEFAULT_DORMANCY_DAYS;

  useEffect(() => {
    if (project && subproject) {
      ui.setScreenContext({
        projectId: project.id,
        projectName: project.name,
        subprojectId: subproject.id,
        subprojectName: subproject.name,
      });
    }
  }, [project, subproject, ui.setScreenContext]);

  if (projects.isError) return <LoadError onRetry={() => void projects.refetch()} />;
  if (!project || !subproject) return projects.isPending ? null : <EmptyState>{t('project.notFound')}</EmptyState>;

  return (
    <>
      <PageHeader
        actions={
          <>
            <ViewSwitch view={view} />
            <FilterMenu filters={filters} />
            <NewTopicButton onClick={() => ui.openCreate({ projectId: project.id, subprojectId: subproject.id })} />
          </>
        }
      >
        <Breadcrumb
          items={[
            {
              label: (
                <>
                  <ColorSquare color={project.color} />
                  {project.name}
                </>
              ),
              link: { to: '/p/$key', params: { key: project.key } },
            },
            { label: subproject.name },
          ]}
        />
      </PageHeader>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 px-4 pt-5 pb-4 sm:px-6">
        <div className="flex flex-[1_1_360px] flex-col gap-1">
          <h1 className="m-0 font-semibold text-xl tracking-[-0.02em]">{subproject.name}</h1>
          {subproject.description ? <p className="m-0 max-w-[620px] text-ink-3">{subproject.description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-6">
          {subproject.targetDate ? (
            <span className="flex items-center gap-2 text-ink-3 text-xs">
              {t('project.target')}
              <span className="font-medium text-ink">{formatShortDate(subproject.targetDate)}</span>
            </span>
          ) : null}
          <span className="flex min-w-50 items-center gap-2.5">
            <ProgressBar progress={subproject.progress} className="flex-auto" />
            <span className="text-ink-3 text-xs tabular-nums">
              {t('views.doneOfTotal', { done: subproject.progress.done, total: subproject.progress.total })}
            </span>
          </span>
        </div>
      </div>

      {topics.isError ? <LoadError onRetry={() => void topics.refetch()} /> : null}
      {topics.data ? (
        view === 'kanban' ? (
          <KanbanBoard
            topics={visible}
            dormancyDays={dormancyDays}
            createContext={{ projectId: project.id, subprojectId: subproject.id }}
          />
        ) : (
          <div className="border-border border-t">
            <TopicList
              topics={visible}
              allTopics={topics.data}
              group={search.group ?? 'status'}
              createContext={{ projectId: project.id, subprojectId: subproject.id }}
              dormancyDays={dormancyDays}
              emptyLabel={hasFilters(filters) ? t('views.emptyFiltered') : t('views.empty')}
            />
          </div>
        )
      ) : null}
    </>
  );
}

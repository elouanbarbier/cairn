import {
  DEFAULT_DORMANCY_DAYS,
  isClosed,
  PROJECT_LIVE_STATUSES,
  type ProjectStatus,
  type ProjectSummary,
  type SubprojectSummary,
  type TopicSummary,
} from '@cairn/shared';
import { Link } from '@tanstack/react-router';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  EllipsisIcon,
  HistoryIcon,
  LayersIcon,
  LinkIcon,
  NotebookTextIcon,
  PlusIcon,
  SearchXIcon,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ActivityItem } from '@/components/activity-item';
import { ColorSquare, EmptyState, LoadError, ProgressBar } from '@/components/bits';
import { ColorPicker } from '@/components/create-project-dialog';
import { DatePopover, InlineTitle, MarkdownEditor } from '@/components/editors';
import { Breadcrumb, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatShortDate } from '@/lib/format';
import { useMe, useProject, useProjectActivity, useTopics, useUpdateProject, useUpdateSubproject } from '@/lib/queries';
import { useTopicPanel } from '@/lib/topic-panel';
import { useUi } from '@/lib/ui-state';
import { cn } from '@/lib/utils';
import { type ProjectTab, projectRoute, subprojectRoute, type ViewSearch } from '@/router';
import { filterTopics, hasFilters, parseFilters } from './filters';
import { KanbanBoard } from './kanban-board';
import { TopicList } from './topic-list';
import { EmptyListAction, FilterMenu, GroupMenu, ViewSwitch } from './view-controls';

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

const pillClass = 'inline-flex h-6 items-center gap-1.5 rounded-full px-2 font-medium text-xs';

/** Status pill; a menu of the live statuses unless the item is archived. */
function StatusMenu({
  status,
  label,
  onChange,
}: {
  status: ProjectStatus;
  label: string;
  onChange?: (status: ProjectStatus) => void;
}) {
  const { t } = useTranslation();
  const pill = (
    <>
      <span className={cn('size-1.5 rounded-full', STATUS_PILL[status].dot)} aria-hidden />
      {t(`projectStatus.${status}`)}
    </>
  );
  if (!onChange) return <span className={cn(pillClass, STATUS_PILL[status].pill)}>{pill}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}, ${t(`projectStatus.${status}`)}`}
        className={cn(pillClass, STATUS_PILL[status].pill, 'border-0 hover:brightness-95')}
      >
        {pill}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={status} onValueChange={(v) => onChange(v as ProjectStatus)}>
          {PROJECT_LIVE_STATUSES.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {t(`projectStatus.${s}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Target date shown as text; a date popover when editable. */
function TargetDate({
  value,
  label,
  onCommit,
}: {
  value: string | null;
  label: string;
  onCommit?: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const text = (
    <span className={cn('font-medium', !value && 'font-normal text-ink-4')}>
      {value ? formatShortDate(value) : t('project.none')}
    </span>
  );
  if (!onCommit) return text;
  return (
    <DatePopover
      value={value}
      onCommit={onCommit}
      label={label}
      clearLabel={t('project.clearTarget')}
      triggerClassName="-mx-1.5 inline-flex h-6 items-center rounded-md border-0 bg-transparent px-1.5 text-ink text-sm hover:bg-accent data-[state=open]:bg-accent"
    >
      {text}
    </DatePopover>
  );
}

function ArchivedBanner({
  children,
  onRestore,
  restoreLabel,
}: {
  children: ReactNode;
  onRestore: () => void;
  restoreLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-border border-b bg-muted px-4 py-2.5 text-ink-3 sm:px-8">
      <ArchiveIcon className="size-4 shrink-0" strokeWidth={1.9} aria-hidden />
      <span className="min-w-0 flex-auto">{children}</span>
      <Button variant="outline" onClick={onRestore}>
        <ArchiveRestoreIcon className="size-3.5" aria-hidden />
        {restoreLabel}
      </Button>
    </div>
  );
}

/** A project or subproject that does not exist (any more): say so, and lead back home. */
function NotFound({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<SearchXIcon strokeWidth={1.75} />}
      action={
        <Link to="/" className="font-medium text-brand underline underline-offset-2">
          {t('topic.backToOverview')}
        </Link>
      }
    >
      {children}
    </EmptyState>
  );
}

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

/** First line of a Markdown text, without its block markers, for a one-line summary. */
function summary(markdown: string): string {
  const line = markdown
    .split('\n')
    .map((l) => l.replace(/^\s*(#{1,6}\s|[-*+]\s|>\s?|\d+\.\s)/, '').trim())
    .find(Boolean);
  return line ?? '';
}

/* ---------------------------------- Project ---------------------------------- */

export function ProjectPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const { key } = projectRoute.useParams();
  const search = projectRoute.useSearch();
  const { project, isPending, isError, refetch } = useProject(key);
  const topics = useTopics({ project: key.toUpperCase() }, Boolean(project));
  const me = useMe();
  const update = useUpdateProject();
  const tab: ProjectTab = search.tab ?? 'topics';
  const archived = Boolean(project?.archivedAt);

  useEffect(() => {
    if (project) ui.setScreenContext(archived ? {} : { projectId: project.id, projectName: project.name });
  }, [project, archived, ui.setScreenContext]);

  if (isError) return <LoadError onRetry={refetch} />;
  if (!project) return isPending ? null : <NotFound>{t('project.notFound')}</NotFound>;

  const change = (patch: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ key: project.key, patch });
  const setArchived = (value: boolean) =>
    update.mutate(
      { key: project.key, patch: { status: value ? 'archived' : 'active' } },
      {
        onSuccess: () =>
          toast.success(t(value ? 'project.archivedToast' : 'project.restoredToast', { name: project.name })),
      },
    );
  const editable = !archived;

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
                {editable ? (
                  <DropdownMenuItem onSelect={() => ui.setSubprojectDialogFor(project.key)}>
                    <LayersIcon className="size-3.5" aria-hidden />
                    {t('project.newSubproject')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setArchived(!archived)}>
                  {archived ? (
                    <ArchiveRestoreIcon className="size-3.5" aria-hidden />
                  ) : (
                    <ArchiveIcon className="size-3.5" aria-hidden />
                  )}
                  {t(archived ? 'project.restore' : 'project.archive')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {editable ? <NewTopicButton onClick={() => ui.openCreate({ projectId: project.id })} /> : null}
          </>
        }
      >
        <Breadcrumb items={[{ label: t('project.breadcrumbRoot'), link: { to: '/' } }, { label: project.name }]} />
      </PageHeader>

      {archived ? (
        <ArchivedBanner onRestore={() => setArchived(false)} restoreLabel={t('project.restore')}>
          {t('project.archivedBanner')}
        </ArchivedBanner>
      ) : null}

      <div className="flex flex-col gap-4.5 border-border border-b px-4 pt-6 sm:px-8">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="flex flex-[1_1_360px] items-start gap-3.5">
            <Popover>
              <PopoverTrigger
                disabled={!editable}
                aria-label={t('project.changeColor')}
                className="grid size-9 shrink-0 place-items-center rounded-lg border-0 p-0 enabled:hover:brightness-95"
                style={{ background: `color-mix(in srgb, ${project.color} 14%, transparent)`, color: project.color }}
              >
                <LayersIcon className="size-[18px]" strokeWidth={1.9} aria-hidden />
              </PopoverTrigger>
              <PopoverContent>
                <ColorPicker
                  value={project.color}
                  onChange={(color) => change({ color })}
                  label={t('project.changeColor')}
                />
              </PopoverContent>
            </Popover>
            <div className="flex min-w-0 flex-auto flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <InlineTitle
                  value={project.name}
                  onSave={(name) => change({ name })}
                  label={t('project.editName')}
                  readOnly={!editable}
                  className="font-semibold text-xl tracking-[-0.02em]"
                />
                <span className="rounded bg-muted px-1.5 py-px font-mono text-caption text-ink-3">{project.key}</span>
              </div>
              {project.description ? (
                <p className="m-0 line-clamp-2 max-w-[620px] text-ink-3">{summary(project.description)}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-6">
            <Meta label={t('project.status')}>
              <StatusMenu
                status={project.status}
                label={t('project.changeStatus')}
                onChange={editable ? (status) => change({ status }) : undefined}
              />
            </Meta>
            <Meta label={t('project.target')}>
              <TargetDate
                value={project.targetDate}
                label={t('project.changeTarget')}
                onCommit={editable ? (targetDate) => change({ targetDate }) : undefined}
              />
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
          onCreate={editable ? () => ui.openCreate({ projectId: project.id }) : undefined}
        />
      ) : null}
      {tab === 'subprojects' ? <SubprojectCards project={project} editable={editable} /> : null}
      {tab === 'notes' ? (
        <div className="flex max-w-[760px] flex-col px-4 py-6 sm:px-8">
          {project.description || editable ? (
            <MarkdownEditor
              value={project.description}
              onSave={(description) => change({ description })}
              label={t('project.editNotes')}
              placeholder={t('project.notesPlaceholder')}
              readOnly={!editable}
            />
          ) : (
            <EmptyState icon={<NotebookTextIcon strokeWidth={1.75} />}>{t('project.notesEmpty')}</EmptyState>
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
  onCreate,
}: {
  project: ProjectSummary;
  topics: TopicSummary[] | undefined;
  error: boolean;
  retry: () => void;
  search: ViewSearch;
  dormancyDays: number;
  /** New topic in this project; absent when the project is archived. */
  onCreate?: () => void;
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
            emptyAction={<EmptyListAction filtered={hasFilters(filters)} onCreate={onCreate} />}
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

function SubprojectCards({ project, editable }: { project: ProjectSummary; editable: boolean }) {
  const { t } = useTranslation();
  const ui = useUi();
  const update = useUpdateSubproject();
  const restore = (sub: SubprojectSummary) =>
    update.mutate(
      { id: sub.id, patch: { status: 'active' } },
      { onSuccess: () => toast.success(t('subproject.restoredToast', { name: sub.name })) },
    );
  const add = () => ui.setSubprojectDialogFor(project.key);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-8">
      {project.subprojects.length === 0 ? (
        <EmptyState
          icon={<LayersIcon strokeWidth={1.75} />}
          action={
            editable ? (
              <Button variant="outline" onClick={add}>
                <PlusIcon className="size-3.5" strokeWidth={2} aria-hidden />
                {t('project.newSubproject')}
              </Button>
            ) : undefined
          }
        >
          {t('project.subprojectsEmpty')}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {project.subprojects.map((sub) => (
            <Link
              key={sub.id}
              to="/p/$key/s/$subprojectId"
              params={{ key: project.key, subprojectId: sub.id }}
              className="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-4 py-3.5 text-ink no-underline transition-colors duration-150 hover:bg-subtle"
            >
              <span className="font-semibold">{sub.name}</span>
              {sub.description ? (
                <span className="line-clamp-2 text-ink-3 text-xs">{summary(sub.description)}</span>
              ) : null}
              <ProgressBar progress={sub.progress} label={sub.name} />
              <span className="flex items-center justify-between text-ink-4 text-xs tabular-nums">
                <span>{t('project.openTopics', { count: sub.openCount })}</span>
                <span>
                  {sub.progress.done}/{sub.progress.total}
                  {sub.targetDate ? ` · ${formatShortDate(sub.targetDate)}` : ''}
                </span>
              </span>
            </Link>
          ))}
          {editable ? (
            <Button variant="dashed" onClick={add} className="h-auto min-h-24 flex-col gap-1.5 text-ink-3">
              <PlusIcon className="size-4" strokeWidth={2} aria-hidden />
              {t('project.newSubproject')}
            </Button>
          ) : null}
        </div>
      )}

      {project.archivedSubprojects.length > 0 ? (
        <section aria-labelledby="archived-subprojects" className="flex max-w-[640px] flex-col">
          <h2 id="archived-subprojects" className="m-0 mb-1.5 font-medium text-caption text-ink-4">
            {t('project.archivedSubprojects')}
          </h2>
          {project.archivedSubprojects.map((sub) => (
            <div key={sub.id} className="flex min-h-9 items-center gap-3 border-line border-t text-ink-3">
              <ArchiveIcon className="size-3.5 shrink-0 text-ink-4" strokeWidth={1.9} aria-hidden />
              <Link
                to="/p/$key/s/$subprojectId"
                params={{ key: project.key, subprojectId: sub.id }}
                className="min-w-0 flex-auto truncate text-ink-2 no-underline hover:underline"
              >
                {sub.name}
              </Link>
              <span className="text-ink-4 text-xs tabular-nums">
                {sub.progress.done}/{sub.progress.total}
              </span>
              {editable ? (
                <Button variant="ghost" size="sm" onClick={() => restore(sub)}>
                  {t('project.restoreSubproject')}
                  <span className="sr-only"> {sub.name}</span>
                </Button>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ProjectActivity({ projectKey }: { projectKey: string }) {
  const { t } = useTranslation();
  const activity = useProjectActivity(projectKey);
  const panel = useTopicPanel();
  if (activity.isError) return <LoadError onRetry={() => void activity.refetch()} />;
  if (!activity.data) return null;
  if (activity.data.length === 0) {
    return <EmptyState icon={<HistoryIcon strokeWidth={1.75} />}>{t('project.activityEmpty')}</EmptyState>;
  }
  return (
    <ol className="m-0 flex max-w-[860px] list-none flex-col gap-3 px-4 py-6 text-ink-3 text-small sm:px-8">
      {activity.data.map((entry) => {
        const ref = entry.topicRef;
        return (
          <ActivityItem
            key={entry.id}
            entry={entry}
            suffix={
              ref ? (
                <>
                  {' · '}
                  <Link
                    to="/p/$key/sujets/$ref"
                    params={{ key: projectKey, ref }}
                    onClick={panel.onLinkClick({ projectKey, ref })}
                    className="text-ink-2 underline decoration-ink-5 underline-offset-2 hover:decoration-current"
                  >
                    <span className="font-mono text-caption">{ref}</span> {entry.topicTitle}
                  </Link>
                </>
              ) : null
            }
          />
        );
      })}
    </ol>
  );
}

/* --------------------------------- Subproject --------------------------------- */

export function SubprojectPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const { key, subprojectId } = subprojectRoute.useParams();
  const search = subprojectRoute.useSearch();
  const { project, isPending, isError, refetch } = useProject(key);
  const subproject =
    project && [...project.subprojects, ...project.archivedSubprojects].find((s) => s.id === subprojectId);
  const topics = useTopics({ subproject: subprojectId }, Boolean(subproject));
  const me = useMe();
  const update = useUpdateSubproject();
  const view = search.view ?? 'kanban';
  const filters = parseFilters(search);
  const visible = useMemo(
    () => filterTopics(topics.data ?? [], filters, new Date(), { recentClosedOnly: view === 'list' }),
    [topics.data, filters, view],
  );
  const dormancyDays = me.data?.dormancyDays ?? DEFAULT_DORMANCY_DAYS;
  const archived = Boolean(subproject?.archivedAt || project?.archivedAt);

  useEffect(() => {
    if (project && subproject) {
      ui.setScreenContext(
        archived
          ? {}
          : {
              projectId: project.id,
              projectName: project.name,
              subprojectId: subproject.id,
              subprojectName: subproject.name,
            },
      );
    }
  }, [project, subproject, archived, ui.setScreenContext]);

  if (isError) return <LoadError onRetry={refetch} />;
  if (!project || !subproject) return isPending ? null : <NotFound>{t('subproject.notFound')}</NotFound>;

  const editable = !archived;
  const change = (patch: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: subproject.id, patch });
  const setArchived = (value: boolean) =>
    update.mutate(
      { id: subproject.id, patch: { status: value ? 'archived' : 'active' } },
      {
        onSuccess: () =>
          toast.success(t(value ? 'subproject.archivedToast' : 'subproject.restoredToast', { name: subproject.name })),
      },
    );
  const createContext = { projectId: project.id, subprojectId: subproject.id };

  return (
    <>
      <PageHeader
        actions={
          <>
            <ViewSwitch view={view} />
            <FilterMenu filters={filters} />
            {project.archivedAt ? null : (
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setArchived(!subproject.archivedAt)}>
                    {subproject.archivedAt ? (
                      <ArchiveRestoreIcon className="size-3.5" aria-hidden />
                    ) : (
                      <ArchiveIcon className="size-3.5" aria-hidden />
                    )}
                    {t(subproject.archivedAt ? 'subproject.restore' : 'subproject.archive')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {editable ? <NewTopicButton onClick={() => ui.openCreate(createContext)} /> : null}
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

      {subproject.archivedAt && !project.archivedAt ? (
        <ArchivedBanner onRestore={() => setArchived(false)} restoreLabel={t('subproject.restore')}>
          {t('subproject.archivedBanner')}
        </ArchivedBanner>
      ) : null}

      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 px-4 pt-5 pb-4 sm:px-6">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1">
          <InlineTitle
            value={subproject.name}
            onSave={(name) => change({ name })}
            label={t('subproject.editName')}
            readOnly={!editable}
            className="font-semibold text-xl tracking-[-0.02em]"
          />
          <div className="max-w-[620px]">
            <MarkdownEditor
              value={subproject.description}
              onSave={(description) => change({ description })}
              label={t('subproject.editDescription')}
              placeholder={t('subproject.descriptionPlaceholder')}
              className="text-ink-3 text-sm"
              readOnly={!editable}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6 pt-1">
          <StatusMenu
            status={subproject.status}
            label={t('subproject.changeStatus')}
            onChange={editable ? (status) => change({ status }) : undefined}
          />
          <span className="flex items-center gap-2 text-ink-3 text-xs">
            {t('project.target')}
            <TargetDate
              value={subproject.targetDate}
              label={t('subproject.changeTarget')}
              onCommit={editable ? (targetDate) => change({ targetDate }) : undefined}
            />
          </span>
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
          <KanbanBoard topics={visible} dormancyDays={dormancyDays} createContext={createContext} />
        ) : (
          <div className="border-border border-t">
            <TopicList
              topics={visible}
              allTopics={topics.data}
              group={search.group ?? 'status'}
              createContext={createContext}
              dormancyDays={dormancyDays}
              emptyLabel={hasFilters(filters) ? t('views.emptyFiltered') : t('views.empty')}
              emptyAction={
                <EmptyListAction
                  filtered={hasFilters(filters)}
                  onCreate={editable ? () => ui.openCreate(createContext) : undefined}
                />
              }
            />
          </div>
        )
      ) : null}
    </>
  );
}

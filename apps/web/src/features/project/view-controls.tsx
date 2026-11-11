import { TOPIC_PRIORITIES, TOPIC_STATUSES } from '@cairn/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDownIcon, KanbanSquareIcon, ListFilterIcon, ListIcon, PlusIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/bits';
import { PriorityIcon, StatusIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLabels, useUsers } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { GroupBy, ListView, ViewSearch } from '@/router';
import { DUE_FILTERS, filterCount, type ParsedFilters, UNASSIGNED } from './filters';

/** Search-param updater for the current route. */
export function useSearchUpdater() {
  const navigate = useNavigate();
  return (patch: Partial<ViewSearch>) =>
    void navigate({ to: '.', search: (prev: ViewSearch) => ({ ...prev, ...patch }), replace: true });
}

export function ViewSwitch({ view }: { view: ListView }) {
  const { t } = useTranslation();
  const item =
    'inline-flex h-6.5 items-center gap-1.5 rounded-[5px] px-2.5 font-medium text-ink-3 no-underline transition-colors duration-150 hover:text-ink';
  return (
    <nav aria-label={t('views.switchView')} className="inline-flex rounded-[7px] bg-muted p-0.5">
      <Link
        to="."
        search={(prev: ViewSearch) => ({ ...prev, view: 'list' as const })}
        aria-current={view === 'list' ? 'page' : undefined}
        className={cn(item, view === 'list' && 'bg-background text-ink shadow-segment')}
      >
        <ListIcon className="size-3.5" strokeWidth={2} aria-hidden />
        {t('views.list')}
      </Link>
      <Link
        to="."
        search={(prev: ViewSearch) => ({ ...prev, view: 'kanban' as const })}
        aria-current={view === 'kanban' ? 'page' : undefined}
        className={cn(item, view === 'kanban' && 'bg-background text-ink shadow-segment')}
      >
        <KanbanSquareIcon className="size-3.5" strokeWidth={2} aria-hidden />
        {t('views.kanban')}
      </Link>
    </nav>
  );
}

export const NO_FILTERS: Partial<ViewSearch> = {
  status: undefined,
  priority: undefined,
  label: undefined,
  due: undefined,
  assignee: undefined,
  q: undefined,
};

/** Filters of the cadrage: status, priority, label, due date and assignee, each in its own submenu. */
export function FilterMenu({ filters }: { filters: ParsedFilters }) {
  const { t } = useTranslation();
  const update = useSearchUpdater();
  const labels = useLabels();
  const users = useUsers();
  const count = filterCount(filters);
  const toggle = <T extends string>(list: readonly T[], value: T) =>
    (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]).join(',') || undefined;
  const keepOpen = (event: Event) => event.preventDefault();

  const sub = (label: string, active: number, children: ReactNode) => (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {label}
        {active > 0 ? <span className="text-brand text-xs tabular-nums">{active}</span> : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="dashed" className={cn(count > 0 && 'border-brand border-solid text-brand')}>
            <ListFilterIcon className="size-3.5" strokeWidth={1.9} />
            {t('views.filter')}
            {count > 0 ? <span className="tabular-nums">· {count}</span> : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {sub(
            t('topic.props.status'),
            filters.statuses.length,
            TOPIC_STATUSES.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={filters.statuses.includes(status)}
                onSelect={keepOpen}
                onCheckedChange={() => update({ status: toggle(filters.statuses, status) })}
              >
                <StatusIcon status={status} />
                {t(`status.${status}`)}
              </DropdownMenuCheckboxItem>
            )),
          )}
          {sub(
            t('topic.props.priority'),
            filters.priorities.length,
            [...TOPIC_PRIORITIES].reverse().map((priority) => (
              <DropdownMenuCheckboxItem
                key={priority}
                checked={filters.priorities.includes(priority)}
                onSelect={keepOpen}
                onCheckedChange={() => update({ priority: toggle(filters.priorities, priority) })}
              >
                <PriorityIcon priority={priority} />
                {t(`priority.${priority}`)}
              </DropdownMenuCheckboxItem>
            )),
          )}
          {sub(
            t('topic.props.labels'),
            filters.labels.length,
            (labels.data ?? []).map((label) => (
              <DropdownMenuCheckboxItem
                key={label.id}
                checked={filters.labels.includes(label.id)}
                onSelect={keepOpen}
                onCheckedChange={() => update({ label: toggle(filters.labels, label.id) })}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: label.color }} />
                {label.name}
              </DropdownMenuCheckboxItem>
            )),
          )}
          {sub(
            t('topic.props.due'),
            filters.due.length,
            DUE_FILTERS.map((due) => (
              <DropdownMenuCheckboxItem
                key={due}
                checked={filters.due.includes(due)}
                onSelect={keepOpen}
                onCheckedChange={() => update({ due: toggle(filters.due, due) })}
              >
                {t(`views.dueFilter.${due}`)}
              </DropdownMenuCheckboxItem>
            )),
          )}
          {sub(t('topic.props.assignee'), filters.assignees.length, [
            ...(users.data ?? []).map((user) => (
              <DropdownMenuCheckboxItem
                key={user.id}
                checked={filters.assignees.includes(user.id)}
                onSelect={keepOpen}
                onCheckedChange={() => update({ assignee: toggle(filters.assignees, user.id) })}
              >
                <Avatar user={user} size={18} />
                {user.name}
              </DropdownMenuCheckboxItem>
            )),
            <DropdownMenuCheckboxItem
              key={UNASSIGNED}
              checked={filters.assignees.includes(UNASSIGNED)}
              onSelect={keepOpen}
              onCheckedChange={() => update({ assignee: toggle(filters.assignees, UNASSIGNED) })}
            >
              {t('topic.unassigned')}
            </DropdownMenuCheckboxItem>,
          ])}
          {count > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => update(NO_FILTERS)}>{t('views.clearFilters')}</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {filters.q ? (
        <span className="inline-flex h-7.5 items-center gap-1 rounded-md bg-brand-soft pr-1 pl-2.5 text-brand text-xs">
          {t('views.containing', { q: filters.q })}
          <button
            type="button"
            aria-label={t('views.clearFilters')}
            onClick={() => update({ q: undefined })}
            className="grid size-5 place-items-center rounded border-0 bg-transparent p-0 text-brand"
          >
            <XIcon className="size-3" aria-hidden />
          </button>
        </span>
      ) : null}
    </>
  );
}

/** The main action of an empty list: clear the filters that hide everything, or create the first topic. */
export function EmptyListAction({ filtered, onCreate }: { filtered: boolean; onCreate?: () => void }) {
  const { t } = useTranslation();
  const update = useSearchUpdater();
  if (filtered) {
    return (
      <Button variant="outline" onClick={() => update(NO_FILTERS)}>
        <XIcon className="size-3.5" aria-hidden />
        {t('views.clearFilters')}
      </Button>
    );
  }
  if (!onCreate) return null;
  return (
    <Button variant="outline" onClick={onCreate}>
      <PlusIcon className="size-3.5" strokeWidth={2} aria-hidden />
      {t('nav.newTopic')}
    </Button>
  );
}

export function GroupMenu({ group }: { group: GroupBy }) {
  const { t } = useTranslation();
  const update = useSearchUpdater();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="font-normal text-ink-2">
          {t('views.groupBy')}
          <span className="font-medium text-ink">{t(`views.groups.${group}`)}</span>
          <ChevronDownIcon className="size-3" strokeWidth={2.25} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={group} onValueChange={(value) => update({ group: value as GroupBy })}>
          <DropdownMenuRadioItem value="subproject">{t('views.groups.subproject')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="status">{t('views.groups.status')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

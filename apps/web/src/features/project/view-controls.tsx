import { TOPIC_PRIORITIES, TOPIC_STATUSES } from '@cairn/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDownIcon, KanbanSquareIcon, ListFilterIcon, ListIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PriorityIcon, StatusIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { GroupBy, ListView, ViewSearch } from '@/router';
import { hasFilters, type ParsedFilters } from './filters';

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

export function FilterMenu({ filters }: { filters: ParsedFilters }) {
  const { t } = useTranslation();
  const update = useSearchUpdater();
  const active = hasFilters(filters);
  const toggle = <T extends string>(list: T[], value: T) =>
    (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]).join(',') || undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="dashed" className={cn(active && 'border-brand border-solid text-brand')}>
            <ListFilterIcon className="size-3.5" strokeWidth={1.9} />
            {t('views.filter')}
            {active ? (
              <span className="tabular-nums">
                · {filters.statuses.length + filters.priorities.length + (filters.q ? 1 : 0)}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>{t('topic.props.status')}</DropdownMenuLabel>
          {TOPIC_STATUSES.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={filters.statuses.includes(status)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => update({ status: toggle(filters.statuses, status) })}
            >
              <StatusIcon status={status} />
              {t(`status.${status}`)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('topic.props.priority')}</DropdownMenuLabel>
          {[...TOPIC_PRIORITIES].reverse().map((priority) => (
            <DropdownMenuCheckboxItem
              key={priority}
              checked={filters.priorities.includes(priority)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => update({ priority: toggle(filters.priorities, priority) })}
            >
              <PriorityIcon priority={priority} />
              {t(`priority.${priority}`)}
            </DropdownMenuCheckboxItem>
          ))}
          {active ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => update({ status: undefined, priority: undefined, q: undefined })}>
                {t('views.clearFilters')}
              </DropdownMenuItem>
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

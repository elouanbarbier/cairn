import { DEFAULT_DORMANCY_DAYS } from '@cairn/shared';
import { useRouterState } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadError } from '@/components/bits';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { filterTopics, hasFilters, parseFilters } from '@/features/project/filters';
import { KanbanBoard } from '@/features/project/kanban-board';
import { TopicList } from '@/features/project/topic-list';
import { EmptyListAction, FilterMenu, ViewSwitch } from '@/features/project/view-controls';
import { useMe, useTopics } from '@/lib/queries';
import { useUi } from '@/lib/ui-state';
import type { ViewSearch } from '@/router';

/** Topics assigned to the current user, across projects. */
export function MyTopicsPage() {
  const { t } = useTranslation();
  const ui = useUi();
  const search = useRouterState({ select: (s) => s.location.search as ViewSearch });
  const me = useMe();
  const topics = useTopics({ assignee: 'me' });
  const view = search.view ?? 'list';
  const filters = parseFilters(search);
  const visible = useMemo(
    () => filterTopics(topics.data ?? [], filters, new Date(), { recentClosedOnly: view === 'list' }),
    [topics.data, filters, view],
  );
  const dormancyDays = me.data?.dormancyDays ?? DEFAULT_DORMANCY_DAYS;

  useEffect(() => ui.setScreenContext({}), [ui.setScreenContext]);

  return (
    <>
      <PageHeader
        actions={
          <>
            <ViewSwitch view={view} />
            <FilterMenu filters={filters} />
            <Button onClick={() => ui.openCreate({})} className="pr-2">
              {t('nav.newTopic')}
              <Kbd variant="inverse">C</Kbd>
            </Button>
          </>
        }
      >
        <span className="font-medium">{t('nav.myTopics')}</span>
      </PageHeader>
      {topics.isError ? <LoadError onRetry={() => void topics.refetch()} /> : null}
      {topics.data ? (
        view === 'list' ? (
          <TopicList
            topics={visible}
            allTopics={topics.data}
            group="status"
            showProject
            dormancyDays={dormancyDays}
            emptyLabel={hasFilters(filters) ? t('views.emptyFiltered') : t('views.emptyMine')}
            emptyAction={<EmptyListAction filtered={hasFilters(filters)} />}
          />
        ) : (
          <div className="flex flex-auto flex-col pt-4">
            <KanbanBoard topics={visible} dormancyDays={dormancyDays} createContext={{}} />
          </div>
        )
      ) : null}
    </>
  );
}

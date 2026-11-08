import { createRootRoute, createRoute, createRouter, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/bits';
import { AppShell } from '@/components/layout/app-shell';
import { MyTopicsPage } from '@/features/my-topics/my-topics-page';
import { OverviewPage } from '@/features/overview/overview-page';
import { ProjectPage, SubprojectPage } from '@/features/project/project-page';
import { TopicPage } from '@/features/topic/topic-page';

export type ListView = 'list' | 'kanban';
export type GroupBy = 'subproject' | 'status';
export type ProjectTab = 'topics' | 'subprojects' | 'notes' | 'activity';

export interface ViewSearch {
  view?: ListView;
  group?: GroupBy;
  q?: string;
  tab?: ProjectTab;
  status?: string;
  priority?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Keeps only known search params so URLs stay clean and typed. */
function validateViewSearch(search: Record<string, unknown>): ViewSearch {
  const view = search.view === 'list' || search.view === 'kanban' ? search.view : undefined;
  const group = search.group === 'subproject' || search.group === 'status' ? search.group : undefined;
  const tab = ['topics', 'subprojects', 'notes', 'activity'].includes(String(search.tab))
    ? (search.tab as ProjectTab)
    : undefined;
  return { view, group, tab, q: str(search.q), status: str(search.status), priority: str(search.priority) };
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <EmptyState
      action={
        <Link to="/" className="font-medium text-brand">
          {t('topic.backToOverview')}
        </Link>
      }
    >
      {t('project.notFound')}
    </EmptyState>
  );
}

const rootRoute = createRootRoute({ component: AppShell, notFoundComponent: NotFound });

const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: OverviewPage });

const myTopicsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/mes-sujets',
  validateSearch: validateViewSearch,
  component: MyTopicsPage,
});

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$key',
  validateSearch: validateViewSearch,
  component: ProjectPage,
});

export const subprojectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$key/s/$subprojectId',
  validateSearch: validateViewSearch,
  component: SubprojectPage,
});

export const topicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$key/sujets/$ref',
  component: TopicPage,
});

const routeTree = rootRoute.addChildren([overviewRoute, myTopicsRoute, projectRoute, subprojectRoute, topicRoute]);

export const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

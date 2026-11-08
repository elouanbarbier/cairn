import type {
  ChecklistItem,
  CreateProjectInput,
  CreateSubprojectInput,
  CreateTopicInput,
  ProjectSummary,
  SetupInput,
  SubprojectSummary,
  TopicDetail,
  TopicSummary,
  UpdateChecklistItemInput,
  UpdateProjectInput,
  UpdateSubprojectInput,
  UpdateTopicInput,
} from '@cairn/shared';
import { isClosed } from '@cairn/shared';
import { keepPreviousData, type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { ApiRequestError, api, type TopicFilter } from './api.ts';
import { todayISO } from './format.ts';

export const queryKeys = {
  setup: ['setup'] as const,
  me: ['me'] as const,
  users: ['users'] as const,
  labels: ['labels'] as const,
  projects: ['projects'] as const,
  archivedProjects: ['projects', 'archived'] as const,
  project: (key: string) => ['projects', 'one', key] as const,
  overview: (today: string) => ['overview', today] as const,
  topics: (filter: TopicFilter) => ['topics', filter] as const,
  topic: (ref: string) => ['topic', ref] as const,
  projectActivity: (key: string) => ['project-activity', key] as const,
  search: (q: string) => ['search', q] as const,
};

export const useSetupStatus = () =>
  useQuery({ queryKey: queryKeys.setup, queryFn: api.setupStatus, staleTime: Number.POSITIVE_INFINITY });
export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: api.me });
export const useUsers = () => useQuery({ queryKey: queryKeys.users, queryFn: api.users, staleTime: 5 * 60_000 });
export const useLabels = () => useQuery({ queryKey: queryKeys.labels, queryFn: api.labels, staleTime: 5 * 60_000 });
export const useProjects = () => useQuery({ queryKey: queryKeys.projects, queryFn: api.projects });
export const useArchivedProjects = (enabled = true) =>
  useQuery({ queryKey: queryKeys.archivedProjects, queryFn: api.archivedProjects, enabled });

/** A project by key, archived ones included. Projects in use come straight from the project list. */
export function useProject(key: string) {
  const upper = key.toUpperCase();
  const projects = useProjects();
  const fromList = projects.data?.find((p) => p.key === upper);
  const single = useQuery({
    queryKey: queryKeys.project(upper),
    queryFn: () => api.project(upper),
    enabled: Boolean(upper) && projects.isSuccess && !fromList,
    retry: (count, error) => !(error instanceof ApiRequestError && error.status === 404) && count < 2,
  });
  const notFound = single.error instanceof ApiRequestError && single.error.status === 404;
  return {
    project: fromList ?? single.data,
    isPending: projects.isPending || (!fromList && single.isLoading),
    isError: projects.isError || (single.isError && !notFound),
    refetch: () => void (projects.isError ? projects.refetch() : single.refetch()),
  };
}
export const useOverview = () => {
  const today = todayISO();
  return useQuery({ queryKey: queryKeys.overview(today), queryFn: () => api.overview(today) });
};
export const useTopics = (filter: TopicFilter, enabled = true) =>
  useQuery({ queryKey: queryKeys.topics(filter), queryFn: () => api.topics(filter), enabled });
export const useTopic = (ref: string) => useQuery({ queryKey: queryKeys.topic(ref), queryFn: () => api.topic(ref) });
export const useProjectActivity = (key: string) =>
  useQuery({ queryKey: queryKeys.projectActivity(key), queryFn: () => api.projectActivity(key) });
export const useSearch = (q: string) =>
  useQuery({
    queryKey: queryKeys.search(q),
    queryFn: () => api.search(q),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

/** Everything derived from topics: refreshed after any topic change. */
function invalidateTopicViews(client: QueryClient) {
  for (const key of [['topics'], ['topic'], ['overview'], ['projects'], ['me'], ['search'], ['project-activity']]) {
    void client.invalidateQueries({ queryKey: key });
  }
}

function applyPatch<T extends TopicSummary>(topic: T, patch: UpdateTopicInput, labels?: TopicSummary['labels']): T {
  const next: T = { ...topic };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.status !== undefined) {
    next.status = patch.status;
    if (isClosed(patch.status) && !isClosed(topic.status)) next.completedAt = new Date().toISOString();
    if (!isClosed(patch.status)) next.completedAt = null;
  }
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;
  if (patch.subprojectId !== undefined) next.subprojectId = patch.subprojectId;
  if (patch.labelIds !== undefined && labels) next.labels = labels.filter((l) => patch.labelIds?.includes(l.id));
  return next;
}

/**
 * Optimistic topic update: lists, detail and search update at once; on a
 * server error everything rolls back and a toast explains it.
 */
export function useUpdateTopic() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, patch }: { ref: string; patch: UpdateTopicInput }) => api.updateTopic(ref, patch),
    onMutate: async ({ ref, patch }) => {
      await client.cancelQueries({ queryKey: ['topics'] });
      await client.cancelQueries({ queryKey: ['topic', ref] });
      const labels = client.getQueryData<TopicSummary['labels']>(queryKeys.labels);
      const lists = client.getQueriesData<TopicSummary[]>({ queryKey: ['topics'] });
      const detail = client.getQueryData<TopicDetail>(queryKeys.topic(ref));
      client.setQueriesData<TopicSummary[]>({ queryKey: ['topics'] }, (old) =>
        old?.map((t) => (t.ref === ref ? applyPatch(t, patch, labels) : t)),
      );
      if (detail) client.setQueryData(queryKeys.topic(ref), applyPatch(detail, patch, labels));
      return { lists, detail };
    },
    onError: (_error, { ref }, context) => {
      for (const [key, data] of context?.lists ?? []) client.setQueryData(key, data);
      if (context?.detail) client.setQueryData(queryKeys.topic(ref), context.detail);
      toast.error(i18n.t('errors.rollback'));
    },
    onSuccess: (topic) => client.setQueryData(queryKeys.topic(topic.ref), topic),
    onSettled: () => invalidateTopicViews(client),
  });
}

export function useCreateTopic() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTopicInput) => api.createTopic(input),
    onSuccess: (topic) => {
      client.setQueryData(queryKeys.topic(topic.ref), topic);
      toast.success(i18n.t('createTopic.created', { ref: topic.ref }));
    },
    onError: () => toast.error(i18n.t('errors.rollback')),
    onSettled: () => invalidateTopicViews(client),
  });
}

export function useUpdateChecklistItem(ref: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateChecklistItemInput }) => api.updateChecklistItem(id, patch),
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: queryKeys.topic(ref) });
      const previous = client.getQueryData<TopicDetail>(queryKeys.topic(ref));
      if (previous) {
        const items = previous.checklistItems.map((i) => (i.id === id ? { ...i, ...patch } : i));
        client.setQueryData<TopicDetail>(queryKeys.topic(ref), {
          ...previous,
          checklistItems: items,
          checklist: { done: items.filter((i) => i.done).length, total: items.length },
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) client.setQueryData(queryKeys.topic(ref), context.previous);
      toast.error(i18n.t('errors.rollback'));
    },
    onSettled: () => invalidateTopicViews(client),
  });
}

export function useAddChecklistItem(ref: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.addChecklistItem(ref, { text }),
    onMutate: async (text) => {
      await client.cancelQueries({ queryKey: queryKeys.topic(ref) });
      const previous = client.getQueryData<TopicDetail>(queryKeys.topic(ref));
      if (previous) {
        const optimistic: ChecklistItem = {
          id: `optimistic-${Date.now()}`,
          topicId: previous.id,
          text,
          done: false,
          sortOrder: '~',
        };
        client.setQueryData<TopicDetail>(queryKeys.topic(ref), {
          ...previous,
          checklistItems: [...previous.checklistItems, optimistic],
          checklist: { done: previous.checklist.done, total: previous.checklist.total + 1 },
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) client.setQueryData(queryKeys.topic(ref), context.previous);
      toast.error(i18n.t('errors.rollback'));
    },
    onSettled: () => invalidateTopicViews(client),
  });
}

export function useAddNote(ref: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.addNote(ref, { body }),
    onMutate: async (body) => {
      await client.cancelQueries({ queryKey: queryKeys.topic(ref) });
      const previous = client.getQueryData<TopicDetail>(queryKeys.topic(ref));
      const me = client.getQueryData<{ user: TopicDetail['assignee'] }>(queryKeys.me);
      if (previous) {
        const at = new Date().toISOString();
        client.setQueryData<TopicDetail>(queryKeys.topic(ref), {
          ...previous,
          notes: [
            ...previous.notes,
            {
              id: `optimistic-${at}`,
              topicId: previous.id,
              author: me?.user ?? null,
              body,
              createdAt: at,
              updatedAt: at,
            },
          ],
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) client.setQueryData(queryKeys.topic(ref), context.previous);
      toast.error(i18n.t('errors.rollback'));
    },
    onSettled: () => invalidateTopicViews(client),
  });
}

/* ---------- Setup, projects and subprojects ---------- */

export function useSetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SetupInput) => api.setup(input),
    onSuccess: () => {
      client.setQueryData(queryKeys.setup, { required: false });
      void client.invalidateQueries();
    },
  });
}

/** Snapshot of every cached project (lists and single projects), for rollback. */
type ProjectCache = Array<[readonly unknown[], ProjectSummary[] | ProjectSummary | undefined]>;

function updateCachedProjects(client: QueryClient, update: (project: ProjectSummary) => ProjectSummary | null) {
  const snapshot = client.getQueriesData<ProjectSummary[] | ProjectSummary>({ queryKey: queryKeys.projects });
  for (const [key, data] of snapshot) {
    if (!data) continue;
    if (Array.isArray(data)) {
      client.setQueryData(
        key,
        data.flatMap((p) => {
          const next = update(p);
          return next ? [next] : [];
        }),
      );
    } else {
      const next = update(data);
      if (next) client.setQueryData(key, next);
    }
  }
  return snapshot as ProjectCache;
}

function restoreProjects(client: QueryClient, snapshot: ProjectCache | undefined) {
  for (const [key, data] of snapshot ?? []) client.setQueryData(key, data);
}

function archiveStamp(status: string | undefined, current: string | null): string | null {
  if (status === undefined) return current;
  if (status === 'archived') return current ?? new Date().toISOString();
  return null;
}

function rollbackToast(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 409) return;
  toast.error(i18n.t('errors.rollback'));
}

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(input),
    onSuccess: (project) => {
      client.setQueryData<ProjectSummary[]>(queryKeys.projects, (old) => (old ? [...old, project] : old));
      toast.success(i18n.t('createProject.created', { name: project.name }));
    },
    onError: rollbackToast,
    onSettled: () => invalidateTopicViews(client),
  });
}

/**
 * Optimistic project update. Archiving drops the project from the lists in use at once; any failure rolls the
 * cache back with a toast.
 */
export function useUpdateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: UpdateProjectInput }) => api.updateProject(key, patch),
    onMutate: async ({ key, patch }) => {
      await client.cancelQueries({ queryKey: queryKeys.projects });
      const archiving = patch.status === 'archived';
      const snapshot = updateCachedProjects(client, (p) => {
        if (p.key !== key) return p;
        return { ...p, ...patch, archivedAt: archiveStamp(patch.status, p.archivedAt) };
      });
      // The project leaves the list it was in; the refetch puts it in the other one.
      const leaving = archiving ? queryKeys.projects : patch.status ? queryKeys.archivedProjects : null;
      if (leaving) client.setQueryData<ProjectSummary[]>(leaving, (old) => old?.filter((p) => p.key !== key));
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      restoreProjects(client, context?.snapshot);
      rollbackToast(error);
    },
    onSuccess: (project) => client.setQueryData(queryKeys.project(project.key), project),
    onSettled: () => invalidateTopicViews(client),
  });
}

export function useCreateSubproject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: CreateSubprojectInput }) => api.createSubproject(key, input),
    onSuccess: (sub) => {
      updateCachedProjects(client, (p) =>
        p.id === sub.projectId ? { ...p, subprojects: [...p.subprojects, sub] } : p,
      );
      toast.success(i18n.t('createSubproject.created', { name: sub.name }));
    },
    onError: rollbackToast,
    onSettled: () => invalidateTopicViews(client),
  });
}

/** Optimistic subproject update; archiving moves it to the project's archived subprojects. */
export function useUpdateSubproject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSubprojectInput }) => api.updateSubproject(id, patch),
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: queryKeys.projects });
      const snapshot = updateCachedProjects(client, (p) => {
        const current = [...p.subprojects, ...p.archivedSubprojects].find((s) => s.id === id);
        if (!current) return p;
        const next: SubprojectSummary = {
          ...current,
          ...patch,
          archivedAt: archiveStamp(patch.status, current.archivedAt),
        };
        const others = (list: SubprojectSummary[]) => list.filter((s) => s.id !== id);
        const inPlace = (list: SubprojectSummary[]) => list.map((s) => (s.id === id ? next : s));
        if (next.archivedAt && !current.archivedAt) {
          return { ...p, subprojects: others(p.subprojects), archivedSubprojects: [...p.archivedSubprojects, next] };
        }
        if (!next.archivedAt && current.archivedAt) {
          return {
            ...p,
            subprojects: [...p.subprojects, next].sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : 1)),
            archivedSubprojects: others(p.archivedSubprojects),
          };
        }
        return { ...p, subprojects: inPlace(p.subprojects), archivedSubprojects: inPlace(p.archivedSubprojects) };
      });
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      restoreProjects(client, context?.snapshot);
      rollbackToast(error);
    },
    onSettled: () => invalidateTopicViews(client),
  });
}

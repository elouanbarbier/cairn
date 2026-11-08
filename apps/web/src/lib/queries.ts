import type {
  ChecklistItem,
  CreateTopicInput,
  TopicDetail,
  TopicSummary,
  UpdateChecklistItemInput,
  UpdateTopicInput,
} from '@cairn/shared';
import { isClosed } from '@cairn/shared';
import { keepPreviousData, type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { api, type TopicFilter } from './api.ts';
import { todayISO } from './format.ts';

export const queryKeys = {
  me: ['me'] as const,
  users: ['users'] as const,
  labels: ['labels'] as const,
  projects: ['projects'] as const,
  overview: (today: string) => ['overview', today] as const,
  topics: (filter: TopicFilter) => ['topics', filter] as const,
  topic: (ref: string) => ['topic', ref] as const,
  projectActivity: (key: string) => ['project-activity', key] as const,
  search: (q: string) => ['search', q] as const,
};

export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: api.me });
export const useUsers = () => useQuery({ queryKey: queryKeys.users, queryFn: api.users, staleTime: 5 * 60_000 });
export const useLabels = () => useQuery({ queryKey: queryKeys.labels, queryFn: api.labels, staleTime: 5 * 60_000 });
export const useProjects = () => useQuery({ queryKey: queryKeys.projects, queryFn: api.projects });
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

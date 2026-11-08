import type {
  ApiError,
  ChecklistItem,
  CreateChecklistItemInput,
  CreateNoteInput,
  CreateProjectInput,
  CreateSubprojectInput,
  CreateTopicInput,
  Label,
  Me,
  Overview,
  ProjectActivity,
  ProjectSummary,
  SearchResult,
  SetupInput,
  SetupStatus,
  SubprojectSummary,
  TopicDetail,
  TopicNote,
  TopicSummary,
  UpdateChecklistItemInput,
  UpdateProjectInput,
  UpdateSubprojectInput,
  UpdateTopicInput,
  User,
} from '@cairn/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: json === undefined ? rest.headers : { 'content-type': 'application/json', ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      res.status,
      payload?.error.code ?? 'http_error',
      payload?.error.message ?? res.statusText,
    );
  }
  return (await res.json()) as T;
}

export interface TopicFilter {
  project?: string;
  subproject?: string;
  assignee?: string;
}

export const api = {
  setupStatus: () => request<SetupStatus>('/setup'),
  setup: (input: SetupInput) => request<User>('/setup', { method: 'POST', json: input }),
  me: () => request<Me>('/me'),
  users: () => request<User[]>('/users'),
  labels: () => request<Label[]>('/labels'),
  overview: (today: string) => request<Overview>(`/overview?today=${today}`),
  projects: () => request<ProjectSummary[]>('/projects'),
  archivedProjects: () => request<ProjectSummary[]>('/projects?archived=true'),
  project: (key: string) => request<ProjectSummary>(`/projects/${key}`),
  createProject: (input: CreateProjectInput) => request<ProjectSummary>('/projects', { method: 'POST', json: input }),
  updateProject: (key: string, input: UpdateProjectInput) =>
    request<ProjectSummary>(`/projects/${key}`, { method: 'PATCH', json: input }),
  createSubproject: (key: string, input: CreateSubprojectInput) =>
    request<SubprojectSummary>(`/projects/${key}/subprojects`, { method: 'POST', json: input }),
  updateSubproject: (id: string, input: UpdateSubprojectInput) =>
    request<SubprojectSummary>(`/subprojects/${id}`, { method: 'PATCH', json: input }),
  projectActivity: (key: string) => request<ProjectActivity[]>(`/projects/${key}/activity`),
  topics: (filter: TopicFilter) => {
    const params = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])));
    return request<TopicSummary[]>(`/topics?${params}`);
  },
  topic: (ref: string) => request<TopicDetail>(`/topics/${ref}`),
  createTopic: (input: CreateTopicInput) => request<TopicDetail>('/topics', { method: 'POST', json: input }),
  updateTopic: (ref: string, input: UpdateTopicInput) =>
    request<TopicDetail>(`/topics/${ref}`, { method: 'PATCH', json: input }),
  addChecklistItem: (ref: string, input: CreateChecklistItemInput) =>
    request<ChecklistItem>(`/topics/${ref}/checklist`, { method: 'POST', json: input }),
  updateChecklistItem: (id: string, input: UpdateChecklistItemInput) =>
    request<ChecklistItem>(`/checklist/${id}`, { method: 'PATCH', json: input }),
  addNote: (ref: string, input: CreateNoteInput) =>
    request<TopicNote>(`/topics/${ref}/notes`, { method: 'POST', json: input }),
  search: (q: string) => request<SearchResult>(`/search?q=${encodeURIComponent(q)}`),
};

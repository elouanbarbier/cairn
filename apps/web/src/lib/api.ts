import type {
  Account,
  ApiError,
  ApiToken,
  BackupInfo,
  BulkUpdateTopicsInput,
  ChangePasswordInput,
  ChecklistItem,
  CreateAccountInput,
  CreateChecklistItemInput,
  CreatedToken,
  CreateLabelInput,
  CreateNoteInput,
  CreateProjectInput,
  CreateSubprojectInput,
  CreateTokenInput,
  CreateTopicInput,
  ImportResult,
  LabelUsage,
  LinkInfo,
  LoginInput,
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
  UpdateAccountInput,
  UpdateChecklistItemInput,
  UpdateLabelInput,
  UpdateMeInput,
  UpdateProjectInput,
  UpdateSettingsInput,
  UpdateSubprojectInput,
  UpdateTopicInput,
  User,
  UserLink,
  WorkspaceSettings,
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
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** The request needed a session that is missing or expired. */
export const isUnauthorized = (error: unknown) => error instanceof ApiRequestError && error.status === 401;

export interface TopicFilter {
  project?: string;
  subproject?: string;
  assignee?: string;
}

export const api = {
  setupStatus: () => request<SetupStatus>('/setup'),
  setup: (input: SetupInput) => request<User>('/setup', { method: 'POST', json: input }),
  login: (input: LoginInput) => request<User>('/auth/login', { method: 'POST', json: input }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  logoutOthers: () => request<void>('/auth/logout-others', { method: 'POST' }),
  linkInfo: (token: string) => request<LinkInfo>(`/auth/links/${encodeURIComponent(token)}`),
  redeemLink: (token: string, password: string) =>
    request<User>(`/auth/links/${encodeURIComponent(token)}`, { method: 'POST', json: { password } }),
  me: () => request<Me>('/me'),
  updateMe: (input: UpdateMeInput) => request<User>('/me', { method: 'PATCH', json: input }),
  changePassword: (input: ChangePasswordInput) => request<void>('/me/password', { method: 'POST', json: input }),
  tokens: () => request<ApiToken[]>('/tokens'),
  createToken: (input: CreateTokenInput) => request<CreatedToken>('/tokens', { method: 'POST', json: input }),
  revokeToken: (id: string) => request<void>(`/tokens/${id}`, { method: 'DELETE' }),
  accounts: () => request<Account[]>('/accounts'),
  importWorkspace: (doc: unknown) => request<ImportResult>('/import', { method: 'POST', json: doc }),
  backups: () => request<BackupInfo[]>('/backups'),
  runBackup: () => request<BackupInfo>('/backups', { method: 'POST' }),
  createAccount: (input: CreateAccountInput) =>
    request<{ account: Account; link: UserLink }>('/accounts', { method: 'POST', json: input }),
  updateAccount: (id: string, input: UpdateAccountInput) =>
    request<Account>(`/accounts/${id}`, { method: 'PATCH', json: input }),
  accountLink: (id: string) => request<UserLink>(`/accounts/${id}/link`, { method: 'POST' }),
  settings: () => request<WorkspaceSettings>('/settings'),
  updateSettings: (input: UpdateSettingsInput) =>
    request<WorkspaceSettings>('/settings', { method: 'PATCH', json: input }),
  users: () => request<User[]>('/users'),
  labels: () => request<LabelUsage[]>('/labels'),
  createLabel: (input: CreateLabelInput) => request<LabelUsage>('/labels', { method: 'POST', json: input }),
  updateLabel: (id: string, input: UpdateLabelInput) =>
    request<LabelUsage>(`/labels/${id}`, { method: 'PATCH', json: input }),
  deleteLabel: (id: string) => request<void>(`/labels/${id}`, { method: 'DELETE' }),
  overview: (today: string, exclude: readonly string[] = []) =>
    request<Overview>(`/overview?today=${today}${exclude.length > 0 ? `&exclude=${exclude.join(',')}` : ''}`),
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
  updateTopics: (input: BulkUpdateTopicsInput) => request<TopicSummary[]>('/topics', { method: 'PATCH', json: input }),
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

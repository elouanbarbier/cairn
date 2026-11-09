import {
  accountSchema,
  apiErrorSchema,
  apiTokenSchema,
  backupInfoSchema,
  bulkUpdateTopicsInputSchema,
  changePasswordInputSchema,
  checklistItemSchema,
  createAccountInputSchema,
  createChecklistItemInputSchema,
  createdTokenSchema,
  createNoteInputSchema,
  createProjectInputSchema,
  createSubprojectInputSchema,
  createTokenInputSchema,
  createTopicInputSchema,
  importResultSchema,
  isoDateSchema,
  labelSchema,
  linkInfoSchema,
  loginInputSchema,
  meSchema,
  overviewSchema,
  projectActivitySchema,
  projectSummarySchema,
  searchResultSchema,
  setupInputSchema,
  setupStatusSchema,
  subprojectSummarySchema,
  topicDetailSchema,
  topicNoteSchema,
  topicSummarySchema,
  updateAccountInputSchema,
  updateChecklistItemInputSchema,
  updateMeInputSchema,
  updateProjectInputSchema,
  updateSettingsInputSchema,
  updateSubprojectInputSchema,
  updateTopicInputSchema,
  useLinkInputSchema,
  userLinkSchema,
  userSchema,
  workspaceExportSchema,
  workspaceSettingsSchema,
} from '@cairn/shared';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { type Accounts, type Authenticated, ForbiddenError, UnauthorizedError } from './accounts.ts';
import type { Backups } from './backup.ts';
import { ConflictError, NotFoundError, type Repo, ValidationError } from './repo.ts';

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description,
});
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true },
});
const errors = {
  400: json(apiErrorSchema, 'Invalid request'),
  404: json(apiErrorSchema, 'Not found'),
};
const conflict = { 409: json(apiErrorSchema, 'Conflicts with existing data') };
const denied = {
  401: json(apiErrorSchema, 'Not signed in, or wrong credentials'),
  403: json(apiErrorSchema, 'Not allowed'),
};
const noContent = { 204: { description: 'Done' } };
const tokenParam = z.object({ token: z.string() });

const refParam = z.object({ ref: z.string().openapi({ example: 'POR-24' }) });
const keyParam = z.object({ key: z.string().openapi({ example: 'POR' }) });
const idParam = z.object({ id: z.string() });

const routes = {
  setupStatus: createRoute({
    method: 'get',
    path: '/setup',
    tags: ['Access'],
    security: [],
    responses: { 200: json(setupStatusSchema, 'Whether the administrator still has to be set up') },
  }),
  setup: createRoute({
    method: 'post',
    path: '/setup',
    tags: ['Access'],
    security: [],
    description:
      'First run: creates the administrator (or gives a password to the one of an older install) and signs in.',
    request: body(setupInputSchema),
    responses: { 201: json(userSchema, 'Signed in as the administrator'), ...errors, ...conflict },
  }),
  login: createRoute({
    method: 'post',
    path: '/auth/login',
    tags: ['Access'],
    security: [],
    request: body(loginInputSchema),
    responses: {
      200: json(userSchema, 'Signed in; the session cookie is set'),
      ...errors,
      ...denied,
      429: json(apiErrorSchema, 'Too many attempts'),
    },
  }),
  logout: createRoute({ method: 'post', path: '/auth/logout', tags: ['Access'], responses: noContent }),
  logoutOthers: createRoute({
    method: 'post',
    path: '/auth/logout-others',
    tags: ['Access'],
    description: 'Signs out every other browser of the account.',
    responses: { ...noContent, ...denied },
  }),
  linkInfo: createRoute({
    method: 'get',
    path: '/auth/links/{token}',
    tags: ['Access'],
    security: [],
    request: { params: tokenParam },
    responses: { 200: json(linkInfoSchema, 'Who the link is for'), ...errors },
  }),
  useLink: createRoute({
    method: 'post',
    path: '/auth/links/{token}',
    tags: ['Access'],
    security: [],
    description: 'Chooses the password of an invitation or reset link, then signs in. The link stops working.',
    request: { params: tokenParam, ...body(useLinkInputSchema) },
    responses: { 200: json(userSchema, 'Signed in'), ...errors },
  }),
  updateMe: createRoute({
    method: 'patch',
    path: '/me',
    tags: ['Users'],
    request: body(updateMeInputSchema),
    responses: { 200: json(userSchema, 'Updated account'), ...errors, ...denied, ...conflict },
  }),
  changePassword: createRoute({
    method: 'post',
    path: '/me/password',
    tags: ['Users'],
    description: 'Changes the password and signs out every other browser.',
    request: body(changePasswordInputSchema),
    responses: { ...noContent, ...errors, ...denied },
  }),
  tokens: createRoute({
    method: 'get',
    path: '/tokens',
    tags: ['Access'],
    responses: { 200: json(z.array(apiTokenSchema), 'Your API tokens'), ...denied },
  }),
  createToken: createRoute({
    method: 'post',
    path: '/tokens',
    tags: ['Access'],
    request: body(createTokenInputSchema),
    responses: { 201: json(createdTokenSchema, 'The token, with its secret shown this once'), ...errors, ...denied },
  }),
  revokeToken: createRoute({
    method: 'delete',
    path: '/tokens/{id}',
    tags: ['Access'],
    request: { params: z.object({ id: z.string() }) },
    responses: { ...noContent, ...errors, ...denied },
  }),
  accounts: createRoute({
    method: 'get',
    path: '/accounts',
    tags: ['Users'],
    description: 'Administrators only.',
    responses: { 200: json(z.array(accountSchema), 'Every account'), ...denied },
  }),
  createAccount: createRoute({
    method: 'post',
    path: '/accounts',
    tags: ['Users'],
    description: 'Administrators only. The person joins through the invitation link, to hand over.',
    request: body(createAccountInputSchema),
    responses: {
      201: json(z.object({ account: accountSchema, link: userLinkSchema }), 'Account and invitation link'),
      ...errors,
      ...denied,
      ...conflict,
    },
  }),
  updateAccount: createRoute({
    method: 'patch',
    path: '/accounts/{id}',
    tags: ['Users'],
    description: 'Administrators only: role, or disable (signs the account out everywhere).',
    request: { params: z.object({ id: z.string() }), ...body(updateAccountInputSchema) },
    responses: { 200: json(accountSchema, 'Updated account'), ...errors, ...denied },
  }),
  exportJson: createRoute({
    method: 'get',
    path: '/export',
    tags: ['Data'],
    description: 'Administrators only. The whole workspace as JSON, without passwords, sessions or tokens.',
    responses: { 200: json(workspaceExportSchema, 'Workspace export (download)'), ...denied },
  }),
  exportCsv: createRoute({
    method: 'get',
    path: '/export/topics.csv',
    tags: ['Data'],
    description: 'Administrators only. Every topic, one per line.',
    responses: {
      200: { content: { 'text/csv': { schema: z.string() } }, description: 'Topics (download)' },
      ...denied,
    },
  }),
  importJson: createRoute({
    method: 'post',
    path: '/import',
    tags: ['Data'],
    description: 'Administrators only. Loads an export into a workspace without projects.',
    request: body(workspaceExportSchema),
    responses: { 201: json(importResultSchema, 'Imported'), ...errors, ...denied, ...conflict },
  }),
  backups: createRoute({
    method: 'get',
    path: '/backups',
    tags: ['Data'],
    description: 'Administrators only. Copies of the database in the backup folder, newest first.',
    responses: { 200: json(z.array(backupInfoSchema), 'Backups'), ...denied },
  }),
  runBackup: createRoute({
    method: 'post',
    path: '/backups',
    tags: ['Data'],
    description: 'Administrators only. Backs the database up now (the server also does it every night).',
    responses: { 201: json(backupInfoSchema, 'New backup'), ...denied },
  }),
  accountLink: createRoute({
    method: 'post',
    path: '/accounts/{id}/link',
    tags: ['Users'],
    description: 'Administrators only: a new invitation link, or a password reset link once a password exists.',
    request: { params: z.object({ id: z.string() }) },
    responses: { 201: json(userLinkSchema, 'Link to hand over'), ...errors, ...denied },
  }),
  me: createRoute({ method: 'get', path: '/me', tags: ['Users'], responses: { 200: json(meSchema, 'Current user') } }),
  users: createRoute({
    method: 'get',
    path: '/users',
    tags: ['Users'],
    responses: { 200: json(z.array(userSchema), 'All users') },
  }),
  labels: createRoute({
    method: 'get',
    path: '/labels',
    tags: ['Labels'],
    responses: { 200: json(z.array(labelSchema), 'All labels') },
  }),
  overview: createRoute({
    method: 'get',
    path: '/overview',
    tags: ['Overview'],
    request: {
      query: z.object({
        today: isoDateSchema.optional(),
        exclude: z.string().optional().openapi({ description: 'Project ids to leave out, comma-separated' }),
      }),
    },
    responses: { 200: json(overviewSchema, 'Home overview'), ...errors },
  }),
  settings: createRoute({
    method: 'get',
    path: '/settings',
    tags: ['Settings'],
    responses: { 200: json(workspaceSettingsSchema, 'Workspace settings') },
  }),
  updateSettings: createRoute({
    method: 'patch',
    path: '/settings',
    tags: ['Settings'],
    request: body(updateSettingsInputSchema),
    responses: { 200: json(workspaceSettingsSchema, 'Updated settings'), ...errors },
  }),
  projects: createRoute({
    method: 'get',
    path: '/projects',
    tags: ['Projects'],
    request: {
      query: z.object({
        archived: z.enum(['true', 'false']).optional().openapi({ description: '`true` lists archived projects only' }),
      }),
    },
    responses: { 200: json(z.array(projectSummarySchema), 'Projects with subprojects and counters') },
  }),
  createProject: createRoute({
    method: 'post',
    path: '/projects',
    tags: ['Projects'],
    request: body(createProjectInputSchema),
    responses: { 201: json(projectSummarySchema, 'Created project'), ...errors, ...conflict },
  }),
  project: createRoute({
    method: 'get',
    path: '/projects/{key}',
    tags: ['Projects'],
    request: { params: keyParam },
    responses: { 200: json(projectSummarySchema, 'Project'), ...errors },
  }),
  updateProject: createRoute({
    method: 'patch',
    path: '/projects/{key}',
    tags: ['Projects'],
    request: { params: keyParam, ...body(updateProjectInputSchema) },
    responses: { 200: json(projectSummarySchema, 'Updated project'), ...errors },
  }),
  projectActivity: createRoute({
    method: 'get',
    path: '/projects/{key}/activity',
    tags: ['Projects'],
    request: { params: keyParam },
    responses: { 200: json(z.array(projectActivitySchema), 'Latest activity of the project'), ...errors },
  }),
  createSubproject: createRoute({
    method: 'post',
    path: '/projects/{key}/subprojects',
    tags: ['Projects'],
    request: { params: keyParam, ...body(createSubprojectInputSchema) },
    responses: { 201: json(subprojectSummarySchema, 'Created subproject'), ...errors },
  }),
  updateSubproject: createRoute({
    method: 'patch',
    path: '/subprojects/{id}',
    tags: ['Projects'],
    request: { params: idParam, ...body(updateSubprojectInputSchema) },
    responses: { 200: json(subprojectSummarySchema, 'Updated subproject'), ...errors },
  }),
  topics: createRoute({
    method: 'get',
    path: '/topics',
    tags: ['Topics'],
    request: {
      query: z.object({
        project: z.string().optional().openapi({ description: 'Project key' }),
        subproject: z.string().optional().openapi({ description: 'Subproject id' }),
        assignee: z.string().optional().openapi({ description: 'User id, or `me`' }),
      }),
    },
    responses: { 200: json(z.array(topicSummarySchema), 'Topics, in sort order'), ...errors },
  }),
  createTopic: createRoute({
    method: 'post',
    path: '/topics',
    tags: ['Topics'],
    request: body(createTopicInputSchema),
    responses: { 201: json(topicDetailSchema, 'Created topic'), ...errors },
  }),
  updateTopics: createRoute({
    method: 'patch',
    path: '/topics',
    tags: ['Topics'],
    description: 'The same change on several topics, all or nothing.',
    request: body(bulkUpdateTopicsInputSchema),
    responses: { 200: json(z.array(topicSummarySchema), 'Updated topics'), ...errors },
  }),
  topic: createRoute({
    method: 'get',
    path: '/topics/{ref}',
    tags: ['Topics'],
    request: { params: refParam },
    responses: { 200: json(topicDetailSchema, 'Topic with checklist, notes and activity'), ...errors },
  }),
  updateTopic: createRoute({
    method: 'patch',
    path: '/topics/{ref}',
    tags: ['Topics'],
    request: { params: refParam, ...body(updateTopicInputSchema) },
    responses: { 200: json(topicDetailSchema, 'Updated topic'), ...errors },
  }),
  addChecklistItem: createRoute({
    method: 'post',
    path: '/topics/{ref}/checklist',
    tags: ['Topics'],
    request: { params: refParam, ...body(createChecklistItemInputSchema) },
    responses: { 201: json(checklistItemSchema, 'Created item'), ...errors },
  }),
  updateChecklistItem: createRoute({
    method: 'patch',
    path: '/checklist/{id}',
    tags: ['Topics'],
    request: { params: idParam, ...body(updateChecklistItemInputSchema) },
    responses: { 200: json(checklistItemSchema, 'Updated item'), ...errors },
  }),
  addNote: createRoute({
    method: 'post',
    path: '/topics/{ref}/notes',
    tags: ['Topics'],
    request: { params: refParam, ...body(createNoteInputSchema) },
    responses: { 201: json(topicNoteSchema, 'Created note'), ...errors },
  }),
  search: createRoute({
    method: 'get',
    path: '/search',
    tags: ['Search'],
    request: { query: z.object({ q: z.string().default('') }) },
    responses: { 200: json(searchResultSchema, 'Matching topics and subprojects') },
  }),
};

export const SESSION_COOKIE = 'cairn_session';

export interface ApiOptions {
  /** Public address (`CAIRN_BASE_URL`): its origin is accepted for writes, and `https` makes cookies Secure. */
  baseUrl?: string;
  /** Sign-in attempts allowed per email within the window. */
  loginLimit?: { max: number; windowMs: number };
  /** Database copies; without it, the backup routes list nothing and refuse to run. */
  backups?: Backups;
}

type Env = { Variables: { auth: Authenticated } };

/** Routes anyone can call: health, first run, sign-in, invitation links and the API description. */
const isPublic = (method: string, path: string) =>
  path === '/health' ||
  path === '/openapi.json' ||
  path === '/setup' ||
  (method === 'POST' && path === '/auth/login') ||
  path.startsWith('/auth/links/');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Counts sign-in attempts per email, so passwords cannot be guessed at speed. */
function createLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const attempts = new Map<string, number[]>();
  return {
    hit(key: string) {
      const now = Date.now();
      const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) return false;
      recent.push(now);
      if (attempts.size > 10_000) attempts.clear();
      attempts.set(key, recent);
      return true;
    },
    clear(key: string) {
      attempts.delete(key);
    },
  };
}

class TooManyRequestsError extends Error {}

/** REST API, mounted under `/api`. Every route but the public ones needs a session cookie or an API token. */
export function createApi(repo: Repo, accounts: Accounts, options: ApiOptions = {}) {
  const api = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const message = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
        return c.json({ error: { code: 'invalid_request', message } }, 400);
      }
    },
  });
  const limiter = createLimiter(options.loginLimit ?? { max: 10, windowMs: 15 * 60_000 });
  const baseOrigin = options.baseUrl ? new URL(options.baseUrl).origin : null;

  api.onError((err, c) => {
    const reply = (code: string, status: 400 | 401 | 403 | 404 | 409 | 429) =>
      c.json({ error: { code, message: err.message } }, status);
    if (err instanceof NotFoundError) return reply('not_found', 404);
    if (err instanceof ValidationError) return reply('invalid_request', 400);
    if (err instanceof ConflictError) return reply('conflict', 409);
    if (err instanceof UnauthorizedError) return reply('unauthorized', 401);
    if (err instanceof ForbiddenError) return reply('forbidden', 403);
    if (err instanceof TooManyRequestsError) return reply('rate_limited', 429);
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500);
  });

  /**
   * A browser write from another site (CSRF): refused. Browsers say where a request comes from (`Sec-Fetch-Site`),
   * which holds behind proxies that rewrite `Host`; older browsers only send `Origin`. No header: a script.
   */
  const crossSite = (c: Context) => {
    const site = c.req.header('sec-fetch-site');
    if (site) return site !== 'same-origin' && site !== 'none';
    const origin = c.req.header('origin');
    if (!origin) return false;
    try {
      const url = new URL(origin);
      if (baseOrigin && url.origin === baseOrigin) return false;
      return url.host !== (c.req.header('x-forwarded-host') ?? c.req.header('host'));
    } catch {
      return true;
    }
  };

  const secure = (c: Context) =>
    options.baseUrl?.startsWith('https:') ||
    c.req.header('x-forwarded-proto') === 'https' ||
    new URL(c.req.url).protocol === 'https:';

  const startSession = (c: Context, session: { token: string; maxAge: number }) =>
    setCookie(c, SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: session.maxAge,
      secure: secure(c),
    });

  const userAgent = (c: Context) => c.req.header('user-agent') ?? null;

  api.use('*', async (c, next) => {
    const path = c.req.path.replace(/^\/api(?=\/)/, '');
    if (isPublic(c.req.method, path)) return next();
    const authorization = c.req.header('authorization');
    let auth: Authenticated | null = null;
    if (authorization?.toLowerCase().startsWith('bearer ')) {
      auth = accounts.tokenAuth(authorization.slice(7).trim());
    } else {
      const cookie = getCookie(c, SESSION_COOKIE);
      auth = cookie ? accounts.sessionAuth(cookie) : null;
      if (auth && WRITE_METHODS.has(c.req.method) && crossSite(c)) {
        throw new ForbiddenError('Cross-site request refused');
      }
    }
    if (!auth) throw new UnauthorizedError('Sign in first');
    if (auth.via.kind === 'token' && auth.via.scope === 'read' && c.req.method !== 'GET') {
      throw new ForbiddenError('This token can only read');
    }
    c.set('auth', auth);
    await next();
  });

  const actor = (c: Context<Env>) => c.get('auth').user.id;
  /** Account and token management needs a browser session, not an API token. */
  const sessionOf = (c: Context<Env>) => {
    const auth = c.get('auth');
    if (auth.via.kind !== 'session') throw new ForbiddenError('Only from a signed-in browser');
    return auth.via.sessionId;
  };
  const admin = (c: Context<Env>) => {
    sessionOf(c);
    if (c.get('auth').user.role !== 'admin') throw new ForbiddenError('Administrators only');
  };

  api.get('/health', (c) => c.json({ ok: true }));

  /* ---------- Access ---------- */

  api.openapi(routes.setupStatus, (c) => c.json(accounts.setupStatus(), 200));
  api.openapi(routes.setup, async (c) => {
    const { user, session } = await accounts.setup(c.req.valid('json'), userAgent(c));
    startSession(c, session);
    return c.json(user, 201);
  });
  api.openapi(routes.login, async (c) => {
    const { email, password } = c.req.valid('json');
    if (!limiter.hit(email)) throw new TooManyRequestsError('Too many attempts, try again in a few minutes');
    const { user, session } = await accounts.login(email, password, userAgent(c));
    limiter.clear(email);
    startSession(c, session);
    return c.json(user, 200);
  });
  api.openapi(routes.logout, (c) => {
    const auth = c.get('auth');
    if (auth.via.kind === 'session') accounts.logout(auth.via.sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.body(null, 204);
  });
  api.openapi(routes.logoutOthers, (c) => {
    accounts.logoutOthers(actor(c), sessionOf(c));
    return c.body(null, 204);
  });
  api.openapi(routes.linkInfo, (c) => c.json(accounts.linkInfo(c.req.valid('param').token), 200));
  api.openapi(routes.useLink, async (c) => {
    const { user, session } = await accounts.useLink(
      c.req.valid('param').token,
      c.req.valid('json').password,
      userAgent(c),
    );
    startSession(c, session);
    return c.json(user, 200);
  });

  /* ---------- Own account and tokens ---------- */

  api.openapi(routes.me, (c) => c.json(repo.me(c.get('auth').user), 200));
  api.openapi(routes.updateMe, (c) => {
    sessionOf(c);
    return c.json(accounts.updateMe(actor(c), c.req.valid('json')), 200);
  });
  api.openapi(routes.changePassword, async (c) => {
    const { currentPassword, newPassword } = c.req.valid('json');
    await accounts.changePassword(actor(c), currentPassword, newPassword, sessionOf(c));
    return c.body(null, 204);
  });
  api.openapi(routes.tokens, (c) => {
    sessionOf(c);
    return c.json(accounts.listTokens(actor(c)), 200);
  });
  api.openapi(routes.createToken, (c) => {
    sessionOf(c);
    return c.json(accounts.createToken(actor(c), c.req.valid('json')), 201);
  });
  api.openapi(routes.revokeToken, (c) => {
    sessionOf(c);
    accounts.revokeToken(actor(c), c.req.valid('param').id);
    return c.body(null, 204);
  });

  /* ---------- Administration ---------- */

  api.openapi(routes.accounts, (c) => {
    admin(c);
    return c.json(accounts.listAccounts(), 200);
  });
  api.openapi(routes.createAccount, (c) => {
    admin(c);
    return c.json(accounts.createAccount(c.req.valid('json')), 201);
  });
  api.openapi(routes.updateAccount, (c) => {
    admin(c);
    return c.json(accounts.updateAccount(actor(c), c.req.valid('param').id, c.req.valid('json')), 200);
  });
  api.openapi(routes.accountLink, (c) => {
    admin(c);
    return c.json(accounts.accessLink(c.req.valid('param').id), 201);
  });
  const day = () => new Date().toISOString().slice(0, 10);
  api.openapi(routes.exportJson, (c) => {
    admin(c);
    c.header('content-disposition', `attachment; filename="cairn-export-${day()}.json"`);
    return c.json(repo.exportWorkspace(), 200);
  });
  api.openapi(routes.exportCsv, (c) => {
    admin(c);
    c.header('content-type', 'text/csv; charset=utf-8');
    c.header('content-disposition', `attachment; filename="cairn-topics-${day()}.csv"`);
    return c.body(repo.topicsCsv(), 200);
  });
  api.openapi(routes.importJson, (c) => {
    admin(c);
    return c.json(repo.importWorkspace(c.req.valid('json')), 201);
  });
  api.openapi(routes.backups, (c) => {
    admin(c);
    return c.json(options.backups?.list() ?? [], 200);
  });
  api.openapi(routes.runBackup, async (c) => {
    admin(c);
    if (!options.backups) throw new ValidationError('Backups are off on this server');
    return c.json(await options.backups.run(), 201);
  });
  api.openapi(routes.updateSettings, (c) => {
    admin(c);
    return c.json(repo.updateSettings(c.req.valid('json')), 200);
  });

  /* ---------- Workspace ---------- */

  api.openapi(routes.users, (c) => c.json(repo.listUsers(), 200));
  api.openapi(routes.labels, (c) => c.json(repo.listLabels(), 200));
  api.openapi(routes.overview, (c) => {
    const { today, exclude } = c.req.valid('query');
    return c.json(repo.overview(today, exclude?.split(',').filter(Boolean)), 200);
  });
  api.openapi(routes.settings, (c) => c.json(repo.settings(), 200));
  api.openapi(routes.projects, (c) =>
    c.json(repo.listProjects({ archived: c.req.valid('query').archived === 'true' ? 'only' : 'exclude' }), 200),
  );
  api.openapi(routes.createProject, (c) => c.json(repo.createProject(c.req.valid('json'), actor(c)), 201));
  api.openapi(routes.project, (c) => c.json(repo.getProject(c.req.valid('param').key), 200));
  api.openapi(routes.updateProject, (c) =>
    c.json(repo.updateProject(c.req.valid('param').key, c.req.valid('json'), actor(c)), 200),
  );
  api.openapi(routes.projectActivity, (c) => c.json(repo.listProjectActivity(c.req.valid('param').key), 200));
  api.openapi(routes.createSubproject, (c) =>
    c.json(repo.createSubproject(c.req.valid('param').key, c.req.valid('json'), actor(c)), 201),
  );
  api.openapi(routes.updateSubproject, (c) =>
    c.json(repo.updateSubproject(c.req.valid('param').id, c.req.valid('json'), actor(c)), 200),
  );

  api.openapi(routes.topics, (c) => {
    const query = c.req.valid('query');
    const projectId = query.project ? repo.getProject(query.project).id : undefined;
    const assigneeId = query.assignee === 'me' ? actor(c) : query.assignee;
    return c.json(repo.listTopics({ projectId, subprojectId: query.subproject, assigneeId }), 200);
  });
  api.openapi(routes.createTopic, (c) => c.json(repo.createTopic(c.req.valid('json'), actor(c)), 201));
  api.openapi(routes.updateTopics, (c) => {
    const { refs, patch } = c.req.valid('json');
    return c.json(repo.updateTopics(refs, patch, actor(c)), 200);
  });
  api.openapi(routes.topic, (c) => c.json(repo.getTopic(c.req.valid('param').ref), 200));
  api.openapi(routes.updateTopic, (c) =>
    c.json(repo.updateTopic(c.req.valid('param').ref, c.req.valid('json'), actor(c)), 200),
  );
  api.openapi(routes.addChecklistItem, (c) =>
    c.json(repo.addChecklistItem(c.req.valid('param').ref, c.req.valid('json'), actor(c)), 201),
  );
  api.openapi(routes.updateChecklistItem, (c) =>
    c.json(repo.updateChecklistItem(c.req.valid('param').id, c.req.valid('json'), actor(c)), 200),
  );
  api.openapi(routes.addNote, (c) =>
    c.json(repo.addNote(c.req.valid('param').ref, c.req.valid('json'), actor(c)), 201),
  );
  api.openapi(routes.search, (c) => c.json(repo.search(c.req.valid('query').q), 200));

  api.openAPIRegistry.registerComponent('securitySchemes', 'token', {
    type: 'http',
    scheme: 'bearer',
    description: 'Personal API token (Settings > API tokens), read only or read and write.',
  });
  api.openAPIRegistry.registerComponent('securitySchemes', 'session', {
    type: 'apiKey',
    in: 'cookie',
    name: SESSION_COOKIE,
    description: 'Browser session, set by /auth/login.',
  });
  api.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Cairn API', version: '0.2.0', description: 'Projects, subprojects and topics.' },
    servers: [{ url: '/api' }],
    security: [{ token: [] }, { session: [] }],
  });

  return api;
}

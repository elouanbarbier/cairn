import {
  activitySchema,
  apiErrorSchema,
  checklistItemSchema,
  createChecklistItemInputSchema,
  createNoteInputSchema,
  createTopicInputSchema,
  isoDateSchema,
  labelSchema,
  meSchema,
  overviewSchema,
  projectSummarySchema,
  searchResultSchema,
  topicDetailSchema,
  topicNoteSchema,
  topicSummarySchema,
  updateChecklistItemInputSchema,
  updateTopicInputSchema,
  userSchema,
} from '@cairn/shared';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { NotFoundError, type Repo, ValidationError } from './repo.ts';

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

const refParam = z.object({ ref: z.string().openapi({ example: 'POR-24' }) });
const keyParam = z.object({ key: z.string().openapi({ example: 'POR' }) });
const idParam = z.object({ id: z.string() });

const routes = {
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
    request: { query: z.object({ today: isoDateSchema.optional() }) },
    responses: { 200: json(overviewSchema, 'Home overview'), ...errors },
  }),
  projects: createRoute({
    method: 'get',
    path: '/projects',
    tags: ['Projects'],
    responses: { 200: json(z.array(projectSummarySchema), 'Projects with subprojects and counters') },
  }),
  project: createRoute({
    method: 'get',
    path: '/projects/{key}',
    tags: ['Projects'],
    request: { params: keyParam },
    responses: { 200: json(projectSummarySchema, 'Project'), ...errors },
  }),
  projectActivity: createRoute({
    method: 'get',
    path: '/projects/{key}/activity',
    tags: ['Projects'],
    request: { params: keyParam },
    responses: {
      200: json(
        z.array(activitySchema.extend({ topicRef: z.string().nullable(), topicTitle: z.string().nullable() })),
        'Latest activity of the project',
      ),
      ...errors,
    },
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

/** REST API, mounted under `/api`. */
export function createApi(repo: Repo) {
  const api = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        const message = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
        return c.json({ error: { code: 'invalid_request', message } }, 400);
      }
    },
  });

  api.onError((err, c) => {
    if (err instanceof NotFoundError) return c.json({ error: { code: 'not_found', message: err.message } }, 404);
    if (err instanceof ValidationError)
      return c.json({ error: { code: 'invalid_request', message: err.message } }, 400);
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500);
  });

  api.get('/health', (c) => c.json({ ok: true }));

  api.openapi(routes.me, (c) => c.json(repo.me(), 200));
  api.openapi(routes.users, (c) => c.json(repo.listUsers(), 200));
  api.openapi(routes.labels, (c) => c.json(repo.listLabels(), 200));
  api.openapi(routes.overview, (c) => c.json(repo.overview(c.req.valid('query').today), 200));
  api.openapi(routes.projects, (c) => c.json(repo.listProjects(), 200));
  api.openapi(routes.project, (c) => c.json(repo.getProject(c.req.valid('param').key), 200));
  api.openapi(routes.projectActivity, (c) => c.json(repo.listProjectActivity(c.req.valid('param').key), 200));

  api.openapi(routes.topics, (c) => {
    const query = c.req.valid('query');
    const projectId = query.project ? repo.getProject(query.project).id : undefined;
    const assigneeId = query.assignee === 'me' ? repo.currentUser().id : query.assignee;
    return c.json(repo.listTopics({ projectId, subprojectId: query.subproject, assigneeId }), 200);
  });
  api.openapi(routes.createTopic, (c) => c.json(repo.createTopic(c.req.valid('json')), 201));
  api.openapi(routes.topic, (c) => c.json(repo.getTopic(c.req.valid('param').ref), 200));
  api.openapi(routes.updateTopic, (c) => c.json(repo.updateTopic(c.req.valid('param').ref, c.req.valid('json')), 200));
  api.openapi(routes.addChecklistItem, (c) =>
    c.json(repo.addChecklistItem(c.req.valid('param').ref, c.req.valid('json')), 201),
  );
  api.openapi(routes.updateChecklistItem, (c) =>
    c.json(repo.updateChecklistItem(c.req.valid('param').id, c.req.valid('json')), 200),
  );
  api.openapi(routes.addNote, (c) => c.json(repo.addNote(c.req.valid('param').ref, c.req.valid('json')), 201));
  api.openapi(routes.search, (c) => c.json(repo.search(c.req.valid('query').q), 200));

  api.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Cairn API', version: '0.1.0', description: 'Projects, subprojects and topics.' },
    servers: [{ url: '/api' }],
  });

  return api;
}

# Using the API

Everything the interface does goes through a REST API under `/api`, so scripts, bots and AI assistants can read and
change the workspace too. The full reference is generated from the code in OpenAPI 3.1: `GET /api/openapi.json`
(open it in any OpenAPI viewer, such as Swagger Editor or Scalar, or generate a client from it).

## Get a token

In Cairn: **Settings > API tokens**, give the token a name (what will use it) and a scope:

- **Read only**: `GET` requests only.
- **Read and write**: also creates and changes data. Changes are logged in your name, like your own.

The token (`cairn_…`) is shown once: copy it then. Cairn keeps only a hash. Revoke it from the same place; the list
shows when each token was last used. Account management (users, tokens, password) needs a signed-in browser and
refuses tokens.

Send the token in the `Authorization` header:

```sh
export CAIRN=http://raspberrypi.local:3000
export TOKEN=cairn_…

curl -s "$CAIRN/api/projects" -H "Authorization: Bearer $TOKEN"
```

## Examples

The examples use [`jq`](https://jqlang.org) to read the JSON; any HTTP client works.

### Read

```sh
# Projects, with their counts and progress
curl -s "$CAIRN/api/projects" -H "Authorization: Bearer $TOKEN" | jq '.[] | {key, name}'

# A project's topics, or the topics assigned to you across projects
curl -s "$CAIRN/api/topics?project=POR" -H "Authorization: Bearer $TOKEN"
curl -s "$CAIRN/api/topics?assignee=me" -H "Authorization: Bearer $TOKEN"

# One topic, with its checklist, notes and history
curl -s "$CAIRN/api/topics/POR-24" -H "Authorization: Bearer $TOKEN"

# Full-text search (titles, descriptions, notes), and the overview of the home page
curl -s "$CAIRN/api/search?q=export" -H "Authorization: Bearer $TOKEN" | jq '.topics[] | {ref, title}'
curl -s "$CAIRN/api/overview" -H "Authorization: Bearer $TOKEN"
```

### Write (read and write token)

```sh
# Create a topic: the project is given by its id
PROJECT=$(curl -s "$CAIRN/api/projects/POR" -H "Authorization: Bearer $TOKEN" | jq -r .id)
curl -s -X POST "$CAIRN/api/topics" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT\", \"title\": \"Send the minutes\", \"status\": \"todo\", \"dueDate\": \"2026-12-01\"}" \
  | jq .ref

# Change a topic (any field: status, priority, dueDate, assigneeId, subprojectId, labelIds, title, description)
curl -s -X PATCH "$CAIRN/api/topics/POR-24" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "priority": "high"}'

# Add a note and a checklist item
curl -s -X POST "$CAIRN/api/topics/POR-24/notes" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"body": "Decided in the weekly meeting: ship on Friday."}'
curl -s -X POST "$CAIRN/api/topics/POR-24/checklist" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"text": "Warn support"}'

# The same change on several topics, all or nothing (labels are added or removed, not replaced)
curl -s -X PATCH "$CAIRN/api/topics" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"refs": ["POR-24", "POR-25"], "patch": {"status": "done"}}'
```

Values: statuses are `backlog`, `todo`, `in_progress`, `waiting`, `done`, `cancelled`; priorities `none`, `low`,
`medium`, `high`, `urgent`; dates are `YYYY-MM-DD`. User ids come from `GET /api/users`, label ids from
`GET /api/labels`, subproject ids from `GET /api/projects/{key}`.

There is no delete for topics: close them (`done` or `cancelled`). Projects and subprojects are archived with
`PATCH … {"status": "archived"}` and restored with any other status.

## Errors

Errors answer with a status code and a JSON body:

```json
{ "error": { "code": "not_found", "message": "Topic POR-999 not found" } }
```

| Status | Code              | When                                                                          |
| ------ | ----------------- | ----------------------------------------------------------------------------- |
| 400    | `invalid_request` | A field is missing or invalid; the message names it                           |
| 401    | `unauthorized`    | No token, or a token that is unknown, revoked, or whose owner is disabled     |
| 403    | `forbidden`       | A read only token tried to write, or the route needs an administrator         |
| 404    | `not_found`       | The project, topic or item does not exist                                     |
| 409    | `conflict`        | The data clashes with what exists: a project key or label name already in use |
| 429    | `rate_limited`    | Too many sign-in attempts                                                     |

## For AI assistants

Point the assistant at `/api/openapi.json` and give it a token with the scope it needs: read only to summarize or
answer questions, read and write to create topics from meeting notes or move them along. Create one token per tool,
so each one can be revoked on its own. A built-in MCP server is planned after v1.1 (see [`ideas.md`](ideas.md)).

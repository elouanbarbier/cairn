# Ideas (out of scope for v1.0)

Parking lot for ideas that come up during development. Nothing here gets built before v1.0 ships.

- AI summary button and weekly digest: planned for v1.1 (the overview shows the button with a "coming in v1.1" notice).
- Saved views and undo (Cmd/Ctrl+Z): v1.1.
- AI and bot access: let assistants and bots work in Cairn through the API. Examples: a meeting bot that turns
  decisions into topics, or an assistant that reads, creates, updates and closes topics and other data.
  - Already there: the REST API documented in OpenAPI (`/api/openapi.json`) creates and updates projects,
    subprojects, topics, checklist items and notes.
  - Planned in the brief: API tokens (J4, v1.0) for scripts and AIs, then a built-in MCP server (after v1.1).
  - To decide then:
    - Deletion: the API has none today. Topics close (Done, Cancelled) and projects are archived.
    - Per-token scopes: read only or write.
    - Attribution: the token appears as the actor in the activity log, so a bot's changes stay visible.
    - Batch creation for meeting notes, with deduplication.
    - Webhooks, so bots can react to changes.
    - Rate limiting.

# Ideas (out of scope for v1.0)

Parking lot for ideas that come up during development. Nothing here gets built before v1.0 ships.

- AI summary button and weekly digest: planned for v1.1 (the overview shows the button with a "coming in v1.1" notice).
- Saved views and undo (Cmd/Ctrl+Z): v1.1.
- AI and bot access: let assistants and bots work in Cairn through the API. Examples: a meeting bot that turns
  decisions into topics, or an assistant that reads, creates, updates and closes topics and other data.
  - Already there (J4): the REST API documented in OpenAPI (`/api/openapi.json`), and personal API tokens, read
    only or read and write; a token's changes are logged in its owner's name.
  - Planned in the brief: a built-in MCP server (after v1.1).
  - To decide then:
    - Deletion: the API has none today. Topics close (Done, Cancelled) and projects are archived.
    - Attribution: show the token's name next to its owner in the activity log, so a bot's changes stand out.
    - Batch creation for meeting notes, with deduplication.
    - Webhooks, so bots can react to changes.
    - Rate limiting.

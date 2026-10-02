# hackathon.new WebMCP

hackathon.new registers browser-native tools with `document.modelContext.registerTool`. Signed-in workspace tools stay available across the app. Page tools still follow the current route, role, event lifecycle, judging style, and visible capabilities. An `AbortController` removes page tools when that context changes.

## Human control

Agents may read, navigate, edit ordinary organizer data, and prepare visible work. A person keeps the final click for event creation, sign in, registration, terms and location consent, invitations, project saves and submissions, go-live, announcements, results, judging responses, mentor requests, claims, and resolutions.

Event actions can run directly through `list_event_actions`, `get_event_action`, `execute_event_action`, and `read_action_result`. No app confirmation click is required. Existing `open_*` and `prepare_*` tools are optional previews; they do not save or send anything. To complete an action, use the direct API tool or the existing named mutation tool.

### Direct actions

The catalog loads the deployed OpenAPI schema. It covers event creation/import, registration, team and judge invitations, project submission, all judging response styles, status changes, result publishing, mentor requests, sponsors, prize delivery, announcements, email, schedule, rooms, and other event APIs. The API rechecks the signed-in session, organization, role, ownership, validation, and lifecycle rules. Authentication and required event inputs still apply. Admin/development routes, credentials, API keys, and arbitrary external URLs are outside this catalog.

1. Call `list_event_actions` with search words and optional `writesOnly`.
2. Read `get_event_action` pages until `nextOffset` is null. Supply its path/query/body inputs as JSON strings. Declared expectedOrganizationId fields use the active organization automatically unless explicitly supplied.
3. Read event records through `execute_event_action` GET actions to obtain session-scoped `ref_<session>_N` identifiers. These refs can be used in nested body fields and path parameters.
4. Run the write using `execute_event_action` with a unique `requestKey`. File uploads accept base64 bytes, a field name, filename, and media type; server upload validation still applies.
5. Read all result pages with `read_action_result`. This does not repeat the action. Preserve the API's queued/sent/failed result.

Identical writes with the same key share one request in the current session. Changed input with the same key is rejected. This is session deduplication, not a durable API-wide exactly-once guarantee. Never retry a write with a new key after a lost response without reading current state. A reload starts a new session. Action references are stable across catalog changes. Record and result references carry a random session namespace, so stale values are rejected after reloads or identity/organization changes.

## Tool inventory

| Surface | Tools | When shown |
|---|---|---|
| Signed-in workspace | `open_create_event`, `list_my_organized_events`, `open_organized_event`, `get_organized_event_tasks`, `add_organized_event_task`, `complete_organized_event_task`, `reopen_organized_event_task`, `dismiss_organized_event_task`, `remove_organized_event_task`, `list_my_attendee_events`, `get_attendee_event_guide`, `get_attendee_challenge_links`, `get_attendee_event_status`, `get_attendee_project_draft`, `prepare_attendee_project`, `open_attendee_event` | Available from every signed-in app page. Events use opaque references from the matching list tool. Task lists use offset, limit, and state pages. Challenge links use the opaque challenge reference and paged safe URLs. Attendee reads recheck the current participant role. Project preparation opens the normal review on the current page. |
| Create or import | `get_hackathon_draft`, `update_hackathon_draft`, `open_hackathon_review`, `open_sign_in` | The draft tools stay stable while fields change. Sign in appears only for a signed-out person. |
| Visitor or attendee | `get_event_guide`, `get_challenge_resources`, `get_my_event_status`, `open_registration`, `get_my_team`, `prepare_team_invite`, `get_project_draft`, `prepare_project` | Only the next useful tools appear for the viewer's registration, team, and project state. Released challenge links are safe, complete, and paged. |
| Attendee mentor help | `get_my_mentor_request`, `prepare_mentor_request` | The prepare tool appears only when the attendee can open a new request. |
| Sponsor portfolio | `list_my_sponsorships`, `open_sponsor_event` | A signed-in sponsor can review its events and open the event or prize page. |
| Sponsor prize delivery | `get_sponsor_fulfillments`, `prepare_fulfillment` | Safe delivery status omits recipient, address, and payment details. Preparation opens an optional preview. |
| Organizer reads and navigation | `list_organizer_tasks`, overview, schedule, challenge, prize, project, sponsor, perk, and announcement reads, plus `open_hackathon_section` | Available to the exact event organizer. Task pages include stable task refs and exact links. Perk codes stay hidden. Results and unreleased content are still filtered by lifecycle. |
| Organizer edits | `add_organizer_task`, `complete_organizer_task`, `reopen_organizer_task`, `dismiss_organizer_task`, `remove_organizer_task`, `update_hackathon_details`, `add_schedule_item`, `set_hackathon_timeline`, `add_challenge`, `add_prize`, `prepare_sponsor`, `draft_announcement` | Custom task adds use a client-made `custom-` task ref, so a safe retry does not make a second task. Only custom tasks and requested sponsor listings can be removed. Other writes follow the event stage. Sponsor tools `get_sponsor_details`, `add_sponsor`, `update_sponsor`, and `remove_sponsor` use session references, current event context, and the shared sponsor API. Sponsor preparation still opens the normal editor. Announcements are saved as drafts. |
| Organizer reviews | `open_go_live_review`, `open_publish_review` | Go-live appears for drafts. Results review appears during judging or after completion. Both are optional previews; direct API actions can finish them. |
| Judge | `get_my_judging_status`, `get_judge_assignments`, `get_judge_assignment`, `open_judge_assignment`, plus one of `prepare_judge_scores`, `prepare_judge_picks`, `prepare_judge_bucket`, or `prepare_judge_gates` | Only an assigned judge sees these tools. The preparation tool matches the configured response style and makes no request. |
| Public mentor queue | `get_mentor_queue_status` | Signed-out visitors receive aggregate counts only. |
| Verified mentor | `get_mentor_queue`, `get_mentor_request`, `open_mentor_claim`, `open_mentor_resolve` | Request text is mentor-only. Claim and finish previews are optional; direct actions complete them. |

## Contracts

`lib/webmcp/tool.ts` builds JSON Schema from the same Zod schema used at execution time. All results use one envelope:

```json
{"ok":true,"data":{},"requiresHumanAction":true}
```

or:

```json
{"ok":false,"error":{"code":"event_changed","message":"Refresh the page.","retryable":true}}
```

Tool names and parameter names are at most 30 characters. Descriptions are at most 500 characters, parameter descriptions at most 150, and each serialized result at most 1,500 characters. Read tools use `readOnlyHint: true`; task changes use `readOnlyHint: false`. Tools that return project, attendee, request, or imported text use `untrustedContentHint`.

Organizer task lists accept `offset`, `limit`, and `state`. Each task keeps its stable `taskRef`, exact `destination`, and exact `inspectUrl`. If a browser result reaches its size limit, `nextOffset` points to the first task not shown.

Database, Clerk, participant, team, assignment, prize, criterion, and mentor-request IDs never enter tool results. Browser sessions map them to opaque references and reject references that were not issued or whose source record disappeared.

## Server checks

Hiding a browser tool is not authorization. Each WebMCP request rechecks the authenticated principal, exact event role, ownership, event status, and the server's current `updated_at` value. Mutation requests include the status and event version read by the page. A stale status or version returns a stable `409 event_changed` error.

Draft challenge creation cannot release a challenge. Draft date changes cannot schedule reminders. Existing go-live handlers send work that was safely held while the event was a draft. Invitation responses include `delivery: "sent" | "queued" | "failed"`. The existing `queued` field remains for compatibility and is true only for draft work held until go-live. A failed delivery stays saved and pending, but no reminder is scheduled until email delivery is confirmed.

Signed-out event data is published and audience-filtered. Results require `results_published_at`; challenges require release. Anonymous judging omits team mode, team names, members, submitter identity, and internal IDs. Public mentor data contains counts only; mentor DTOs omit attendee IDs and other mentors' identities.

## Origin trial

`WEBMCP_ORIGIN_TRIAL_TOKEN` is optional and server-only. `next.config.ts` decodes its WebMCP origin and sends it as an `Origin-Trial` response header only when the request host matches. Preview, staging, and production use different exact-origin Vercel values; tokens are never hardcoded. A deployment fails when a configured token is malformed, expired, or within 30 days of expiry.

Keep origin isolation enabled and leave the `tools` Permissions Policy at its `self` default. Native Chrome verification uses `document.modelContext.getTools()` followed by `document.modelContext.executeTool(tool, JSON.stringify(args))`. A wrapper timeout is not proof of an app failure; retry with raw DevTools evaluation and `awaitPromise: true`.

Approved target origins:

- `https://oatmeal-git-feature-webmcp-organizer-tools-agi-ventures-canada.vercel.app`
- `https://staging.hackathon.new`
- `https://hackathon.new`

Origin-trial operations record:

| Exact origin | Vercel environment | Issue date | Expiry | Removal owner |
|---|---|---|---|---|
| `https://oatmeal-git-feature-webmcp-organizer-tools-agi-ventures-canada.vercel.app` | Preview, branch `feature/webmcp-organizer-tools` | 2026-08-26 | 2026-11-17 00:00 UTC (Nov 16 Toronto) | hackathon.new release owner |
| `https://staging.hackathon.new` | Custom environment `staging` | 2026-08-26 | 2026-11-17 00:00 UTC (Nov 16 Toronto) | hackathon.new release owner |
| `https://hackathon.new` | Production | 2026-08-26 | 2026-11-17 00:00 UTC (Nov 16 Toronto) | hackathon.new release owner |

Keep the issue date and expiry in sync with Chrome's enrollment records. The removal owner removes the matching Vercel value when the trial expires or the browser no longer needs it.

See [Chrome's origin-trial guide](https://developer.chrome.com/blog/ai-webmcp-origin-trial) and [troubleshooting guide](https://developer.chrome.com/docs/web-platform/origin-trial-troubleshooting/).

## Verification

Deterministic coverage lives under `__tests__/lib`, `__tests__/services`, `__tests__/components`, and `__tests__/integration`. The model-selection dataset is [evals.json](evals.json). The hosted role and lifecycle matrix is [preview-qa.md](preview-qa.md).

Run only the static project gates before a push:

```bash
bun lint
bun run build
bun run test:all
bun cli:build
```

For this delivery, browser checks run only against a ready Vercel preview. Run the matrix in Codex's built-in browser and in a dedicated Chrome profile for the native WebMCP connection. Use synthetic data and never send a real invitation or publish real results.

## References

- [WebMCP and AI agents](https://developer.chrome.com/docs/ai/agents)
- [Imperative WebMCP API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [Evals for WebMCP](https://developer.chrome.com/docs/ai/webmcp/evals)

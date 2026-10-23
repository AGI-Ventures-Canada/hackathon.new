# Make interactions complete

Use this reference for controls, forms, data loading, and mutations.
Read the existing component and API before changing what an action does.
Keep the app's validation, permissions, and lifecycle rules consistent across surfaces.

## Controls and feedback

Use existing shadcn controls, variants, and accessibility behavior as-is.
Do not replace a menu, dialog, select, or popover with manual keyboard handlers.
Preserve native semantics: links navigate; buttons act; labels name inputs.
Icon-only actions need an accessible name that says what they do.

| State | Check |
| --- | --- |
| Default | The purpose and current value are clear |
| Hover and press | Feedback follows the existing primitive |
| Focus | Keyboard focus is visible and not hidden by sticky UI |
| Disabled | The control cannot act, and the reason is available when useful |
| Pending | Feedback matches an optimistic action or a genuinely asynchronous operation |
| Error | A readable message explains the failure and a useful next step |
| Result | The updated content or message reflects the real response |

Apply states where they make sense; a navigation link does not need a fake loading form.
Do not use color alone for errors, selection, status, or success.
Preserve readable labels and stable layout while feedback appears.

## Ordinary mutations are optimistic

For add, delete, toggle, reorder, assign, and unassign, update the UI before awaiting the API.
Use `hooks/use-optimistic-mutation.ts` for its optimistic, success, revert, and error lifecycle.
For server-prop lists, pair it with `hooks/use-optimistic-list.ts`.
Render `visibleItems` and use pending items, hidden IDs, or local edits as appropriate.
Keep a derived `items` array stable with `useMemo` when passing it to the list hook.
For client-fetched lists, update the existing state array directly and restore it on failure.

Capture enough previous state to roll back exactly what this action changed.
Temporary IDs belong to pending UI records and must never reach UUID queries.
Use `assertOk` for void responses and `assertOkJson<T>` when the body is required.
Preserve response-body handling when an error code needs special treatment.
Refresh server data after success; the mutation hook does this by default.
Keep any `refreshOnSuccess: false` exception intentional and explain its reconciliation path.
Handle duplicate submissions and concurrent changes without losing unrelated edits.

Close ordinary save dialogs in `onOptimistic`; the changed item is immediate feedback.
Keep errors visible after the dialog closes and preserve recoverable input for a retry.
On failure, restore the item or field and show the hook's inline error.
The hook clears its error after eight seconds; do not depend on it as a lasting audit record.
Check the actual callback contract when a child also needs to handle failures.
Do not assume the shared hook rejects: its `execute` catches and reports errors.

## Sensitive and truly asynchronous operations

Keep confirmation and truthful pending feedback for critical state transitions,
bulk email sends, multi-step batch saves, uploads, and external redirects.
Use existing confirmation flows such as `transition-confirm-dialog.tsx`.
Explain the concrete effect before a sensitive or irreversible action.
Prevent repeat execution while the operation is pending.
Never optimistically claim that emails were sent, results published, or an upload completed.
Read queued-vs-immediate discriminators and show the corresponding outcome.
Use Undo only when the backend and product actually support reversal.

## Forms

- Give every field a visible label; placeholders show examples rather than replace labels.
- Connect errors with `aria-describedby` and use `aria-invalid` for invalid fields.
- Preserve entered values after validation or network errors where recovery needs them.
- Keep API validation authoritative and align client rules with it.
- Disable password-manager autofill on ordinary forms using the root guide's attributes.
- Keep login, signup, contact, and profile autofill exceptions.
- Accept bare domains and paths with `type="text"`, `inputMode="url"`, and `normalizeUrl()`.
- Disable URL auto-capitalization and spellcheck; normalize on blur or submit.
- Support Cmd/Ctrl+Enter except for the root guide's search, single-field, and chat cases.
- Focus the first input when appropriate; keep mobile, wizard, and destructive-dialog exceptions.
- Use sensible date defaults, date limits, and existing time-formatting helpers.
- Preserve drafts across refresh and sign-in where the flow already requires it.

Use human-friendly lookup controls for people and records, never raw IDs.
Email-based invites must support registered attendees, existing accounts, and new people.
Keep the pending-invite path for people who have not registered for this event.
Gate sign-in at submission where the existing flow allows drafting beforehand.

## Overlays and navigation

Use the project's Dialog, AlertDialog, Sheet, Popover, and DropdownMenu primitives.
Keep titles, descriptions, focus trapping, Escape behavior, and focus restoration working.
Provide a visible close or cancel action; do not rely on an outside click alone.
Keep required instructions available before moving focus into a destructive action.
Multi-step flows need progress, clear back/exit actions, and a skip destination when supported.
Every hover interaction needs a tap or click equivalent.

## Loading and empty states

Use a skeleton matching the expected list, table, or card geometry.
Keep the page header visible during route loading and slow data fetches.
Show skeletons for client-side search, filter, and pagination requests immediately.
Reserve spinners for operations that cannot be reflected optimistically.
An empty state says what belongs here and offers the next available action.
An error state distinguishes failure from a genuinely empty result and supports recovery.
See [review-finish.md](review-finish.md) for failure and rollback verification.

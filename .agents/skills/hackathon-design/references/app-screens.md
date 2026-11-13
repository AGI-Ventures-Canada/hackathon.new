# Design the surface around the task

Use this reference to choose the right scope before changing an interface.
Start with the existing route, components, data source, and user role.
Read root and directory-level project instructions before implementation.
The project's design system and behavior take priority over a new visual direction.

## Choose the scope

| Surface | Design around | Preserve |
| --- | --- | --- |
| One component | Its job, accessible states, and caller contract | Props, variants, handlers, and surrounding layout |
| Existing app screen | The work someone needs to finish | Shell, routes, permissions, data, and familiar controls |
| Public event page | The event's real details and current lifecycle | Published content, registration rules, and participant paths |
| Requested marketing page | The intended audience and one clear action | Supplied facts, brand assets, and working destinations |

Treat dashboards, organizer management, judging, settings, and attendee tools as app screens.
A public route can still contain an authenticated management screen.
Confirm the route's actual guard and role checks rather than inferring access from its folder.
Do not turn a small edit into a new layout or a site-wide restyle.

## One component

- Search `components/` for an existing implementation before adding one.
- Use shadcn primitives as-is and choose their documented variants and sizes.
- Keep styling changes in the surrounding layout; do not restyle base controls.
- Preserve prop names, event contracts, field names, IDs, and test hooks callers use.
- Check default, focus, disabled, pending, error, and result states where relevant.
- Verify the component in its real parent, including long labels and narrow widths.
- Add only the client boundary needed for interaction; page files stay server components.

## Existing app screen

Name the primary task first: review teams, invite a judge, edit prizes, or score a project.
Put the object and next action where the user can find them without scanning decoration.
Use established tables, tabs, forms, and disclosure patterns.
Choose a table for comparable records; choose cards when each item needs its own summary.
Keep labels, action positions, density, and spacing consistent with nearby screens.
Use color to explain selection and state, with text or icons carrying the same meaning.
Avoid decorative metrics, greetings, or visual effects that compete with the task.

The dashboard sidebar lives in `components/app-sidebar-simple.tsx`.
Mobile navigation lives in `components/mobile-header.tsx` and is a separate interaction.
Preserve these shells unless changing navigation is part of the request.
Keep existing URL tabs, filters, search, and pagination working with browser navigation.
Use shareable URL state where the surrounding feature already supports it.

Every data region needs a useful loading, empty, error, and full state.
Keep the shell visible immediately with `Suspense` and a matching skeleton fallback.
Add a matching `loading.tsx` for a slow sidebar route segment.
During client pagination, filtering, or search, show skeleton content immediately.
Distinguish an empty event from a filter that found no matching records.
See [interaction-and-states.md](interaction-and-states.md) for mutation behavior.

## Public event pages

Use `/e/[slug]` for public event destinations and preserve existing slug handling.
Lead with the event's name, dates, location or format, and the next valid action.
Registration, team formation, projects, judging, and results depend on lifecycle and role.
Read the current rules and API response before showing an action as available.
Explain a closed or unavailable action in short, useful language.
Preserve legal text, consent, organizer content, and event-specific details.
Show only real dates, prices, sponsors, counts, quotes, and results from trusted sources.
If a value is absent, omit it or use the existing honest empty state.
Do not insert sample teams or invented winners into production rendering.
Use fixtures or local test scenarios when realistic data is needed for verification.

## Requested marketing work

Use marketing composition only when the request calls for it.
Build the page around what the visitor came to learn or do.
Choose sections because there is useful content for them, with no fixed section count.
Reuse the project's typography, semantic colors, and component vocabulary.
Use supplied or existing assets; leave unsupported claims and testimonials out.
Wire primary actions to real routes and forms to actual handlers.
Do not show a success message for a form that never made a request.

## Behavior and product parity

Trace each visible action through its handler, API route, validation, and permissions.
Preserve tenant boundaries, role checks, lifecycle gates, and queued side effects.
Use existing APIs and service contracts rather than adding a client-only imitation.
An optimistic update is temporary UI state; server validation remains authoritative.
Show queued, sent, failed, and completed outcomes according to the response.
Keep human-facing copy plain: use "Projects" and "People" where the project does.
Use names, emails, and human-readable times instead of internal IDs or raw timestamps.

Check app, WebMCP, and CLI impact before changing any workflow or capability.
New organizer pages need useful WebMCP read or navigation support.
Use a safe mutation tool when appropriate, or open the human review for sensitive actions.
Update `lib/webmcp/organizer-parity.ts` when its mapped surface changes.
Record any unsupported CLI equivalent and its reason in the PR's Parity section.

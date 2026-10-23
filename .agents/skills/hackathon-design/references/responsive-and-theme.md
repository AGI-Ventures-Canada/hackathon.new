# Preserve the system across sizes and themes

Use this reference for layout, typography, colors, dark mode, and responsive behavior.
Read `app/globals.css`, nearby components, and the current theme provider first.
Extend the existing system only when the requested work needs it.

## Semantic tokens and primitives

Use semantic utilities such as `bg-background`, `text-foreground`, `bg-muted`,
`text-muted-foreground`, `border`, `ring`, `bg-primary`, and `text-destructive`.
Pair surfaces with their foreground roles, including primary, card, and popover content.
Do not add arbitrary palette colors, literal hex values, or a second token system.
Use the existing chart tokens and chart components for quantitative views.
Check actual foreground/background pairings when introducing a new combination.

Use shadcn components as-is, with supported `variant` and `size` props.
Do not override their colors, focus styles, padding, shadows, or radii for visual novelty.
Use layout wrappers for spacing and alignment around the controls.
Preserve the project's typography, radius scale, and established information density.
A small task should not edit global tokens or restyle every screen.

## Light and dark mode

The current provider uses `next-themes` with a class-based theme and system support.
Keep `components/theme-provider.tsx` and the existing switcher as the source of behavior.
Do not add another storage key, inline theme script, or data-attribute theme system.
Check both light and dark mode because semantic tokens serve both.
Verify popovers, dialogs, input errors, disabled controls, and chart labels in each.
Keep focus indicators visible against both the control and its surrounding surface.
Do not invert raster images to simulate dark mode.
Use existing asset variants when logos or images need different treatment.

## Mobile-first layout

Support the project baseline of 375 CSS pixels and wider.
Use mobile-first Tailwind defaults and existing `sm:`, `md:`, and `lg:` conventions.
Start with stacked content, then add columns where the content fits.
Let headers and action groups wrap or stack without hiding the main task.
Use `min-w-0` for shrinkable flex children and appropriate grid track minimums.
Wrap long names, emails, and URLs without widening the page.
Do not hide an overflow bug with a global clipping rule.

Keep controls reachable, readable, and separated on touch screens.
Aim for at least 44px touch targets using existing component sizes and layout space.
If mobile labels collapse, retain an accessible name and a recognizable action.
Never remove essential status, error, or price information just to make a row fit.
Check long real names, empty values, larger text, and content that takes multiple lines.

## Navigation and overlays

The sidebar switches at `lg:` / 1024px, matching `hooks/use-mobile.ts`.
Do not change sidebar visibility to the `md:` breakpoint.
Keep the independent mobile header's drill-down behavior intact.
The mobile menu must lock body scroll, offer an exit, and close after navigation.
Keep modal actions reachable above the virtual keyboard and on short viewports.
Use an internal scrolling region for tall dialog content rather than clipping it.
Check sticky headers and footers for covered fields, messages, and keyboard focus.
Use tap/click access to information otherwise shown on hover.

## Tables, tabs, and media

Wrap tables and tab bars in `overflow-x-auto` containers as the project requires.
Keep row identity and actions discoverable when the table is wider than the phone.
Preserve semantic table headers and meaningful cell labels.
Use an existing responsive record view if one already serves the feature.
Do not silently drop data columns that the user's task depends on.

Use the project's image component and asset conventions.
Reserve image dimensions or aspect ratio to prevent content shifts.
Keep useful alt text; decorative images have empty alt text.
Avoid lazy-loading the first important image where it would delay the main content.
Format dates, durations, and numbers with the existing helpers and event timezone.

## Motion and hydration

Use motion to communicate an interaction or state change.
Prefer targeted transform and opacity transitions in new custom layout code.
Respect reduced-motion preferences and keep content usable without animation.
Preserve shadcn's own transitions rather than overriding base components.
Do not add scroll reveals to routine dashboard content.

Keep server and initial client rendering consistent.
Do not read storage, `window`, `Date.now()`, or `Math.random()` in the first render.
Use the root guide's stable client guard for every storage-derived branch and count.
Test that a theme change and a reload do not produce hydration errors.

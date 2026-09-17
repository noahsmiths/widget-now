# Widget Now

Turn a public webpage into an iOS-inspired live widget. Submit a URL and optional instructions, choose one of three AI-generated designs, customize it, and save it to a private widget library.

The web app uses React, Vite, Tailwind, Convex Auth, the official Firecrawl Convex component, Convex Workflow, and Convex Agent with the OpenAI provider. Widget definitions are versioned declarative JSON; HTML and executable code are never persisted.

## Run locally

```sh
npm install
npm run dev
```

The existing `.env.local` selects the personal Convex development deployment and supplies `VITE_CONVEX_URL`. To connect a fresh checkout, run `npx convex dev` and choose your development project.

Configure provider secrets on the development deployment:

```sh
npx convex env set FIRECRAWL_API_KEY
npx convex env set OPENAI_API_KEY
npx convex env set OPENAI_MODEL gpt-5-mini
```

The first two commands accept secrets through stdin. Keep provider keys in Convex environment variables, never in browser variables or tracked files. `OPENAI_MODEL` is optional and defaults to `gpt-5-mini`. The Firecrawl component requires its key before deployment; a missing OpenAI key produces a clear generation error and can be configured before retrying.

Existing password and GitHub sign-in remain supported. GitHub redirect origins are configured for the local Vite app in `convex/auth.ts`. Public production hosting is not configured by this version.

## How it works

1. An authenticated mutation validates the URL, creates an owner-scoped source, and starts a durable workflow.
2. The Firecrawl component reads that single page as fresh markdown.
3. The first structured OpenAI call extracts labeled scalar fields, stable IDs, units, and supporting source excerpts.
4. A separate call suggests exactly one small square, large square, and wide rectangle. Live elements bind to field IDs; headings are literal text.
5. The editor presents every extracted field, including unused ones. Drag fields onto the canvas or use Add. Move and resize elements, edit text and typography, change themes, add icons and shapes, arrange layers, and undo/redo.
6. Save writes only the widget name and presentation definition. Source values are read-only. Revision checks prevent conflicting saves.

Generation continues across browser navigation and reloads. Transient failures are retried up to three times with exponential backoff. Manual generation retry resumes at the failed stage, preserving completed steps. Failed generation history remains available for resumption; finished generation and refresh histories are cleaned up.

## Declarative contract

`shared/widget.ts` defines the shared `WidgetDefinitionV1`, discriminated element types, validators, formatting, and geometry helpers.

- `version`: `1`.
- `size`: `1x1`, `2x2`, or `2x4`; reference canvases are 160×160, 320×320, and 640×320.
- `background`: six-digit hexadecimal color; `theme`: `light`, `dark`, or `custom`.
- `elements`: an ordered list; later elements render in front of earlier ones.
- Each element has a stable ID, normalized `frame` (`x`, `y`, `width`, `height`), and explicit `style` (`color`, `fontSize`, `fontWeight`, `align`, `wrap`, `opacity`).
- `data` elements bind `fieldId` and customize their display label, label/unit visibility, and numeric precision.
- `text` elements store editable literal text.
- `icon` elements select a curated semantic icon name.
- `shape` elements describe a rectangle or ellipse, fill, and corner radius.

Fonts and radii use reference canvas units. The renderer uniformly scales the canvas and its contents for preview. Changing size preserves normalized element frames. Fixed frames wrap or truncate text instead of moving other elements when values change.

Sources separately store field descriptions, labels, types, units, current values, source evidence, stale flags, and observation timestamps. Widgets reference sources, so multiple saved designs from one generation share one refreshed dataset. Every public source/widget operation derives the user from the authenticated session and checks ownership.

## Live refresh

A minute-based Convex cron selects sources due for their default 15-minute refresh. Only sources with saved widgets are scheduled. A refresh lock prevents overlap; run numbers reject obsolete results. Due sources are processed in bounded batches through the workflow workpool.

Refresh runs a fresh scrape and one extraction call using existing field definitions. It never generates layouts or writes widget definitions. Missing fields retain their last value and observation timestamp and become stale. A failed refresh marks existing values stale, exposes an error, releases the lock, and schedules the next attempt. Refresh now is available for saved widgets. Deleting the last widget stops future refreshes for that source.

Newly discovered data fields require a new generation in v1. The field catalog does not change during refresh.

## Validation

```sh
npm test
npm run lint
npm run build
npx tsc --noEmit -p convex/tsconfig.json
npx convex dev --once
```

Backend tests exercise the actual Firecrawl, Agent, and Workflow components with mocked Firecrawl and OpenAI HTTP responses. They cover full generation, durable retry/resumption, source sharing, ownership, stale fields, overlapping and obsolete refreshes, immutable designs, and conflicting saves. Editor tests cover unused-field inclusion, themes, text, sizes, dragging/resizing at different preview scales, undo/redo, and error recovery.

## V1 limits

Public HTTP(S) webpages only; no website sessions, logged-in scraping, crawling, charts, uploaded images, mobile APIs, or native iOS code. Sources support up to 40 scalar fields and widgets up to 60 elements. Oversized pages are rejected rather than silently truncated. Website availability, scraping restrictions, and provider latency affect refresh completion; the source panel reports observation and attempt timestamps.

# Widget Now

Turn a public webpage into an iOS-inspired live widget. Submit a URL and optional instructions, choose a Square or Rectangle AI-generated design, customize it, and save it to a private widget library.

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

Existing password and GitHub sign-in remain supported. GitHub redirect origins are configured for the local Vite app and the Convex site handoff in `convex/auth.ts`. Production hosting uses the Convex static-hosting component; `npm run deploy` builds the frontend with the production deployment URL, deploys the backend, and publishes the site.

## How it works

1. An authenticated mutation validates the URL, creates an owner-scoped source, and starts a durable workflow.
2. The Firecrawl component reads that single page as fresh markdown.
3. The first structured OpenAI call extracts labeled scalar fields, stable IDs, units, and supporting source excerpts.
4. A separate call suggests exactly one Square and one Rectangle. Live elements bind to field IDs; headings are literal text.
5. The editor presents every extracted field, including unused ones. Drag fields onto the canvas or use Add. Move and resize elements, edit text and typography, change themes, add icons and shapes, arrange layers, and undo/redo.
6. Save writes only the widget name and presentation definition. Source values are read-only. Revision checks prevent conflicting saves.

Generation continues across browser navigation and reloads. Transient failures are retried up to three times with exponential backoff. Manual generation retry resumes at the failed stage, preserving completed steps. Failed generation history remains available for resumption; finished generation and refresh histories are cleaned up.

## Declarative contract

`shared/widget.ts` defines the shared `WidgetDefinitionV1`, discriminated element types, validators, formatting, and geometry helpers.

- `version`: `1`.
- `size`: `square` or `rectangle`; reference canvases are 320×320 and 640×320, respectively.
- `background`: six-digit hexadecimal color; `theme`: `light`, `dark`, or `custom`.
- `elements`: an ordered list; later elements render in front of earlier ones.
- Each element has a stable ID, normalized `frame` (`x`, `y`, `width`, `height`), and explicit `style` (`color`, `fontSize`, `fontWeight`, `align`, `wrap`, `opacity`).
- `data` elements bind `fieldId` and customize their display label, label/unit visibility, and numeric precision.
- `text` elements store editable literal text.
- `icon` elements select a curated semantic icon name.
- `shape` elements describe a rectangle or ellipse, fill, and corner radius.

Fonts and radii use reference canvas units. The renderer uniformly scales the canvas and its contents for preview. Changing size preserves normalized element frames. Fixed frames wrap or truncate text instead of moving other elements when values change.

Sources separately store field descriptions, labels, types, units, current values, source evidence, stale flags, and observation timestamps. Widgets reference sources, so multiple saved designs from one generation share one refreshed dataset. Every public source/widget operation derives the user from the authenticated session and checks ownership.

Initial generation captures a viewport screenshot with the page scrape, derives a six-color widget palette from it, and uses that palette for both size candidates. Refreshes only update live data and retain the saved widget designs.

## Live refresh

A minute-based Convex cron selects sources due for their default 15-minute refresh. Only sources with saved widgets are scheduled. A refresh lock prevents overlap; run numbers reject obsolete results. Due sources are processed in bounded batches through the workflow workpool.

Refresh runs a fresh scrape and one extraction call using existing field definitions. It never generates layouts or writes widget definitions. Missing fields retain their last value and observation timestamp and become stale. A failed refresh marks existing values stale, exposes an error, releases the lock, and schedules the next attempt. Refresh now is available for saved widgets. Deleting the last widget stops future refreshes for that source.

Newly discovered data fields require a new generation in v1. The field catalog does not change during refresh.

## Email watches

Widgets have an optional email notification control. Choose a live data field and condition to activate it for your account's email address. New widgets can be saved from this flow before setting up the watch. Widgets and generation work without AgentMail configuration.

The integration uses the official `agentmail` Node SDK inside Convex Node actions, not the AgentMail Convex component. Configure the personal development deployment:

```sh
npx convex env set AGENTMAIL_API_KEY
npm run setup:agentmail
```

The setup script reuses the existing `widgetnow@agentmail.to` inbox and creates its signed `message.received` webhook idempotently, then sets `AGENTMAIL_INBOX_ID` and `AGENTMAIL_WEBHOOK_SECRET`. It only operates on the development deployment and never sends email. Provider secrets stay on Convex. For a hosted frontend, set `APP_URL` to its HTTPS URL; widget links otherwise point to `http://localhost:5173`.

Watches support a field changing, text containing a phrase, strict greater/less numeric thresholds, or equality with a string/boolean/number. Text contains checks ignore case; string equality ignores case and surrounding whitespace. Convex validates and evaluates rules. OpenAI interprets instructions only when changing a watch by email reply. The initial value establishes a baseline, so enabling, resuming, or editing a watch does not immediately alert on an already-true condition. A threshold/match watch alerts when its condition changes from false to true; a change watch alerts on each observed value change. Missing or stale fields do not update the baseline or trigger mail.

Reply STOP (or PAUSE/UNSUBSCRIBE) or describe a new condition in any watch email. Stopped conditions can be reactivated in Widget Now. Signed webhooks are acknowledged after durably scheduling processing. Replies are matched to a known thread and the account email, checked for spam/unauthenticated/automatic mail, and deduplicated by message ID. Reply commands cannot change recipients, source values, URLs, designs, or refresh schedules.

Alert evaluation and delivery run separately from source refresh. Mail has its own Convex Workflow component and workpool, so slow deliveries/replies do not occupy widget generation or refresh slots. Delivery uses workflow retries and stable AgentMail `Idempotency-Key` headers on sends and replies. Failed delivery is shown in the watch panel and does not affect widgets. Removing a widget/source removes its watches and schedules bounded cleanup of mail history.

## Validation

```sh
npm run lint
npm run build
npx tsc --noEmit -p convex/tsconfig.json
npx convex dev --once
```

Validate behavior manually alongside lint, build, and type checks. This repository does not use unit or integration tests; see `AGENTS.md` for the project policy.

## iOS companion

Open [ios/WidgetNow.xcodeproj](ios/WidgetNow.xcodeproj) with Xcode 26 or later. The project contains the iOS app and a WidgetKit extension, both using the pinned official `ConvexMobile` Swift package. Set your Apple development team for both targets, register the `group.com.widgetnow.shared` App Group and shared `com.widgetnow.shared` Keychain group, and change the example bundle identifiers if your team does not own them. The app and extension must have matching entitlements. The development Convex cloud and site URLs are in `ios/Shared/WidgetModels.swift`; replace both with the same target deployment for distribution and push `convex/mobile.ts`, `convex/auth.ts`, and `convex/http.ts` to it. Run `ruby ios/generate_project.rb` only if you edit the project generator; the generated Xcode project is checked in.

Sign in with the same email/password or GitHub account as the web app. GitHub uses `ASWebAuthenticationSession`; GitHub still calls the Convex OAuth callback at `<site-url>/oauth/github/callback`, which forwards a one-time code through `<site-url>/mobile/oauth/finish` to the app's `widgetnow://oauth` callback. The app redeems that code with its retained state; no session token is placed in the redirect URL. Keep the GitHub OAuth application's callback URL set to the Convex callback, **not** the mobile handoff path. The app maintains a secure shared session and syncs the owner-scoped saved-design catalog. Add a Widget Now Square or Rectangle widget on the Home Screen; these use iOS's small and medium widget families, respectively. Touch and hold the widget, choose **Edit Widget**, and select a saved design of that size. Each instance has its own selection. A normal tap opens the app with setup guidance; iOS does not allow an app to programmatically open or alter the per-instance Edit Widget picker. WidgetKit requests a new timeline after approximately 15 minutes; iOS decides the actual reload time, and the source data follows the existing server refresh schedule.

## V1 limits

Public HTTP(S) webpages only; no website sessions, logged-in scraping, crawling, charts, uploaded images, or mobile APIs. Sources support up to 40 scalar fields and widgets up to 60 elements. Oversized pages are rejected rather than silently truncated. Website availability, scraping restrictions, and provider latency affect refresh completion; the source panel reports observation and attempt timestamps.

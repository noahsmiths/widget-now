# Hackathon log

- **Project:** Widget Now
- **Event:** Convex All Gas Hackathon
- **What it does:** Turns a public webpage into a live, editable widget with AI-extracted data, scheduled refreshes, and optional email watches.
- **Live app:** https://brave-hornet-708.convex.site
- **Repo:** https://github.com/noahsmiths/widget-now
- **Frontend:** Convex static hosting
- **Convex deployment:** https://brave-hornet-708.convex.cloud
- **Components:** @convex-dev/auth, @convex-dev/workflow, @convex-dev/agent, @convex-dev/static-hosting, @firecrawl/firecrawl-convex
- **Convex features:** schema, tables, indexes, queries, paginated queries, mutations, actions, HTTP actions, realtime queries, crons, scheduled functions
- **Auth:** Convex Auth
- **AI models:** gpt-5-mini via the OpenAI provider
- **Started:** 2026-09-11T22:30:53Z
- **Last updated:** 2026-09-22T00:14:46Z

## Log

### 2026-09-11 - 6bf1884
Scaffolded the Convex and React app with password and GitHub sign-in, plus a
realtime shared-number list backed by the initial schema, queries, mutations,
and action (`convex/schema.ts`, `convex/myFunctions.ts`, `convex/auth.ts`, `src/App.tsx`).

### 2026-09-17 - c6caa61
Built the end-to-end widget-generation flow: authenticated, owner-scoped
sources and widgets; Firecrawl scraping; OpenAI structured extraction and
layout proposals; durable workflows; and scheduled refreshes (`convex/sources.ts`, `convex/pipeline.ts`, `convex/workflows.ts`, `convex/crons.ts`).
Added the private widget library and an editable declarative-widget canvas
(`src/App.tsx`, `src/WidgetEditor.tsx`, `shared/widget.ts`).

### 2026-09-20 - b05c461
Added configurable email watches through the AgentMail Node SDK, including a
signed webhook, mail delivery and reply workflows, and persisted watch state
(`convex/agentmail.ts`, `convex/http.ts`, `convex/watches.ts`, `convex/watchMail.ts`).
Expanded the product with an iOS app and WidgetKit extension, and refined the
web editor and visual design (`ios/`, `src/EmailWatch.tsx`, `src/WidgetEditor.tsx`).

### 2026-09-21 - 9e05adc
Changed a generation from a reusable source into a one-widget lifecycle. Saving now
clears unused candidates, prevents a second widget from the same generation, hides saved
generations through a compound owner/saved-count index, and redirects reopened generations
to their existing widget. Deleting that widget also removes its source when it is the last
saved result (`convex/schema.ts`, `convex/sources.ts`, `convex/widgets.ts`, `src/App.tsx`).

### 2026-09-21 - 09a43ea
Rebuilt the editor around an undo/redo reducer and direct canvas manipulation. Added fitted
text and data sizing, drag-and-drop field placement, corner resize handles, live drag previews,
keyboard deletion, element limits, and responsive editor-panel switching. Generated data blocks
are normalized into independently editable labels and values (`src/editorState.ts`,
`src/WidgetEditor.tsx`, `src/WidgetRenderer.tsx`).

### 2026-09-21 - 959bab1
Redesigned notifications and the editor shell together. A widget can now own multiple active
email conditions, add or remove them independently, pause individual conditions, and establish
a baseline immediately without a separate confirmation exchange. The notification dialog,
mobile editor tabs, canvas controls, and property panels were reorganized for denser day-to-day
editing (`convex/watches.ts`, `src/EmailWatch.tsx`, `src/WidgetEditor.tsx`, `src/index.css`).

### 2026-09-21 - fc1c071
Turned the library into a persistent workspace: widgets can be reordered by drag and drop,
opened individually or together in document picture-in-picture, and deleted with cleanup of
their source, watches, and active workflows. Added a paginated generation-status menu and made
source purging cancel durable work before removing related records (`convex/sources.ts`,
`convex/widgets.ts`, `src/App.tsx`, `src/documentPictureInPicture.d.ts`).

### 2026-09-21 - 0109fa0
Narrowed email-reply automation to the safe actions the product can reliably support: stop a
condition, edit one existing condition, or request help. Removed resume/latest commands from
the AI schema and backend reply handling, and simplified alert instructions so stopped watches
must be reactivated in the app (`convex/watchAi.ts`, `convex/watchReplies.ts`,
`convex/watches.ts`, `shared/watch.ts`).

### 2026-09-21 - 2f975be
Registered the Convex static-hosting component, attached its routes to the existing HTTP router,
and added a production deploy command that builds the Vite frontend against the target Convex
deployment before publishing. This moved the web client from local-only Vite serving to the
checked-in Convex hosting path (`convex/convex.config.ts`, `convex/http.ts`, `package.json`).

### 2026-09-21 - f9169d7
Completed mobile release preparation across the app-icon, build-configuration, and TestFlight
work. Debug and Release now inject separate Convex deployments into both the iOS app and
WidgetKit extension; shared Xcode schemes support archiving, the app is scoped to portrait
iPhone, and the web header links signed-in users to the TestFlight build. Added the privacy
policy required for launch (`ios/Config/`, `ios/Shared/WidgetModels.swift`, `ios/`, `src/App.tsx`).

### 2026-09-21 - f69b4ef
Replaced the signed-out login-first page with a concrete before-and-after product story. The
homepage now shows a cropped marketplace page flowing through a curved arrow into a correctly
scaled two-by-two widget on an iPhone home screen; its CTA opens authentication in place. Added
the source image, responsive composition, and durable design direction documentation
(`public/showcase/stockx-product-page.png`, `src/App.tsx`, `src/index.css`, `DESIGN.md`).

### 2026-09-22 - 1cd9089
Raised the AI design stage from a loose “beautiful widget” prompt to a size-aware production
brief with explicit hierarchy, typography, safe-area, spacing, palette-pairing, and element-count
rules. Added deterministic contrast repair, background-first shape ordering, structured clutter
limits, and correct currency-prefix formatting in web and iOS renderers. The design-selection
page also gained a confirmed generation-delete action (`convex/pipeline.ts`, `shared/widget.ts`,
`ios/Shared/WidgetModels.swift`, `src/App.tsx`, `src/ui.ts`).

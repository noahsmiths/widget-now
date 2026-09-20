# Hackathon log

- **Project:** Widget Now
- **Event:** Convex All Gas Hackathon
- **What it does:** Turns a public webpage into a live, editable widget with AI-extracted data, scheduled refreshes, and optional email watches.
- **Live app:** not deployed
- **Repo:** https://github.com/noahsmiths/widget-now
- **Frontend:** Other (React/Vite)
- **Convex deployment:** not deployed
- **Components:** @convex-dev/auth, @convex-dev/workflow, @convex-dev/agent, @firecrawl/firecrawl-convex; AgentMail Node SDK (the Convex component is currently broken)
- **Convex features:** schema, tables, indexes, queries, mutations, actions, HTTP actions, realtime queries, crons, scheduled functions
- **Auth:** Convex Auth
- **AI models:** gpt-5-mini via the OpenAI provider
- **Started:** 2026-09-11T22:30:53Z
- **Last updated:** 2026-09-20T10:01:33Z

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

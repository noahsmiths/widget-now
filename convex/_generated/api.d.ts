/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as agentmail from "../agentmail.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as mailWorkflows from "../mailWorkflows.js";
import type * as mobile from "../mobile.js";
import type * as pipeline from "../pipeline.js";
import type * as sources from "../sources.js";
import type * as users from "../users.js";
import type * as watchAi from "../watchAi.js";
import type * as watchMail from "../watchMail.js";
import type * as watchReplies from "../watchReplies.js";
import type * as watches from "../watches.js";
import type * as widgets from "../widgets.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  agentmail: typeof agentmail;
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  mailWorkflows: typeof mailWorkflows;
  mobile: typeof mobile;
  pipeline: typeof pipeline;
  sources: typeof sources;
  users: typeof users;
  watchAi: typeof watchAi;
  watchMail: typeof watchMail;
  watchReplies: typeof watchReplies;
  watches: typeof watches;
  widgets: typeof widgets;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/core/_generated/component.js").ComponentApi<"auth">;
  authPasswordProvider: import("@convex-dev/auth/providers/password/_generated/component.js").ComponentApi<"authPasswordProvider">;
  authUsername: import("@convex-dev/auth/username/_generated/component.js").ComponentApi<"authUsername">;
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  mailWorkflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"mailWorkflow">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  oauthGithub: import("@convex-dev/auth/providers/oauth/_generated/component.js").ComponentApi<"oauthGithub">;
};

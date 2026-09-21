import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v, ConvexError } from "convex/values";
import {
  vWorkflowId,
  vResultValidator,
  type WorkflowId,
} from "@convex-dev/workflow";
import {
  mutation,
  query,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { workflow } from "./workflows";
import { requireSource, requireUser } from "./access";
import {
  normalizePublicUrl,
  definitionValidator,
  fieldValidator,
  validateDefinition,
} from "../shared/widget";
import schema from "./schema";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { removeWidgetWatch } from "./watches";

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("sources")),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    return ctx.db
      .query("sources")
      .withIndex("by_ownerId_and_savedCount", (q) =>
        q.eq("ownerId", ownerId).eq("savedCount", 0),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
export const get = query({
  args: { sourceId: v.id("sources") },
  returns: schema.doc("sources"),
  handler: async (ctx, args) => requireSource(ctx, args.sourceId),
});
export const readInternal = internalQuery({
  args: { sourceId: v.id("sources") },
  returns: v.union(schema.doc("sources"), v.null()),
  handler: async (ctx, args) => ctx.db.get("sources", args.sourceId),
});

export const start = mutation({
  args: { url: v.string(), blurb: v.string() },
  returns: v.id("sources"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const url = normalizePublicUrl(args.url.trim());
    if (args.blurb.length > 2000)
      throw new ConvexError("Instructions must be under 2,000 characters.");
    const sourceId = await ctx.db.insert("sources", {
      ownerId,
      url,
      blurb: args.blurb.trim(),
      title: new URL(url).hostname,
      fields: [],
      candidates: [],
      status: "scraping",
      error: null,
      run: 1,
      workflowId: null,
      savedCount: 0,
      nextRefreshAt: null,
      refreshing: false,
      refreshRun: 0,
      refreshError: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
    });
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.generate,
      { sourceId, run: 1 },
      {
        onComplete: internal.sources.completed,
        context: { sourceId, run: 1, refresh: false },
      },
    );
    await ctx.db.patch("sources", sourceId, { workflowId });
    return sourceId;
  },
});

export const retry = mutation({
  args: { sourceId: v.id("sources") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await requireSource(ctx, args.sourceId);
    if (source.status !== "failed" || !source.workflowId)
      throw new ConvexError("This generation is not awaiting a retry.");
    await ctx.db.patch("sources", source._id, {
      status: "scraping",
      error: null,
    });
    const from =
      source.failedStage === "designing"
        ? internal.pipeline.design
        : source.failedStage === "extracting"
          ? internal.pipeline.extract
          : internal.pipeline.scrape;
    await workflow.restart(ctx, source.workflowId as WorkflowId, { from });
    return null;
  },
});

export const remove = mutation({
  args: { sourceId: v.id("sources") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await requireSource(ctx, args.sourceId);
    if (source.workflowId)
      await workflow.cancel(ctx, source.workflowId as WorkflowId);
    const widgets = ctx.db
      .query("widgets")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", source._id));
    for await (const widget of widgets) {
      await removeWidgetWatch(ctx, widget._id);
      await ctx.db.delete("widgets", widget._id);
    }
    await ctx.db.delete("sources", source._id);
    return null;
  },
});

export const phase = internalMutation({
  args: {
    sourceId: v.id("sources"),
    run: v.number(),
    status: v.union(
      v.literal("scraping"),
      v.literal("extracting"),
      v.literal("designing"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db.get("sources", args.sourceId);
    if (source && source.run === args.run && source.status !== "ready")
      await ctx.db.patch("sources", source._id, { status: args.status });
    return null;
  },
});

export const finishGeneration = internalMutation({
  args: {
    sourceId: v.id("sources"),
    run: v.number(),
    title: v.string(),
    fields: v.array(fieldValidator),
    candidates: v.array(definitionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db.get("sources", args.sourceId);
    if (!source || source.run !== args.run) return null;
    if (
      args.candidates.length !== 2 ||
      new Set(args.candidates.map((candidate) => candidate.size)).size !== 2
    )
      throw new Error("Expected one candidate per size.");
    for (const candidate of args.candidates)
      validateDefinition(candidate, args.fields);
    await ctx.db.patch("sources", source._id, {
      title: args.title,
      fields: args.fields,
      candidates: args.candidates,
      status: "ready",
      error: null,
      lastSuccessAt: Date.now(),
    });
    return null;
  },
});

async function beginRefresh(ctx: MutationCtx, source: Doc<"sources">) {
  if (source.refreshing || source.savedCount < 1 || source.status !== "ready")
    return false;
  const run = source.refreshRun + 1;
  await ctx.db.patch("sources", source._id, {
    refreshing: true,
    refreshRun: run,
    lastAttemptAt: Date.now(),
    refreshError: null,
    nextRefreshAt: null,
  });
  await workflow.start(
    ctx,
    internal.workflows.refresh,
    { sourceId: source._id, run },
    {
      onComplete: internal.sources.completed,
      context: { sourceId: source._id, run, refresh: true },
    },
  );
  return true;
}

export const requestRefresh = mutation({
  args: { sourceId: v.id("sources") },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    beginRefresh(ctx, await requireSource(ctx, args.sourceId)),
});

export const dispatchRefreshes = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const due = await ctx.db
      .query("sources")
      .withIndex("by_nextRefreshAt", (q) =>
        q.gt("nextRefreshAt", null).lte("nextRefreshAt", Date.now()),
      )
      .take(20);
    for (const source of due) await beginRefresh(ctx, source);
    if (due.length === 20)
      await ctx.scheduler.runAfter(0, internal.sources.dispatchRefreshes, {});
    return null;
  },
});

export const finishRefresh = internalMutation({
  args: {
    sourceId: v.id("sources"),
    run: v.number(),
    fields: v.array(fieldValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db.get("sources", args.sourceId);
    if (!source || !source.refreshing || source.refreshRun !== args.run)
      return null;
    const ids = source.fields.map((field) => field.id);
    if (
      args.fields.length !== ids.length ||
      args.fields.some((field, index) => field.id !== ids[index])
    )
      throw new Error("Field bindings changed during refresh.");
    await ctx.db.patch("sources", source._id, {
      fields: args.fields,
      lastSuccessAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.watches.evaluate, args);
    return null;
  },
});

export const completed = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({
      sourceId: v.id("sources"),
      run: v.number(),
      refresh: v.boolean(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { workflowId, result, context }) => {
    const source = await ctx.db.get("sources", context.sourceId);
    if (
      !source ||
      (context.refresh ? source.refreshRun : source.run) !== context.run
    )
      return null;
    const failure =
      result.kind === "failed"
        ? result.error
            .split("\n")[0]
            .replace(/^Error:\s*/, "")
            .trim()
        : "";
    const error =
      result.kind === "failed"
        ? failure && failure !== "Error"
          ? failure
          : "The provider request failed. Please retry."
        : result.kind === "canceled"
          ? "The request was canceled. Try again."
          : null;
    if (context.refresh) {
      await ctx.db.patch("sources", source._id, {
        refreshing: false,
        refreshError: error,
        nextRefreshAt: source.savedCount ? Date.now() + 15 * 60_000 : null,
        ...(error
          ? {
              fields: source.fields.map((field) => ({ ...field, stale: true })),
            }
          : {}),
      });
    } else if (error)
      await ctx.db.patch("sources", source._id, {
        status: "failed",
        error,
        failedStage: source.status,
      });
    if (context.refresh || !error) {
      if (!context.refresh)
        await ctx.db.patch("sources", source._id, {
          workflowId: null,
          failedStage: undefined,
        });
      await ctx.scheduler.runAfter(1000, internal.sources.cleanupWorkflow, {
        workflowId,
      });
    }
    return null;
  },
});

export const cleanupWorkflow = internalMutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, args) => {
    await workflow.cleanup(ctx, args.workflowId);
    return null;
  },
});

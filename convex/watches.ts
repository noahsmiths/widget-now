import { ConvexError, v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireWidget, requireUser } from "./access";
import schema from "./schema";
import {
  conditionValidator,
  describeCondition,
  emailAddress,
  evaluateWatch,
  matchesCondition,
  validateCondition,
} from "../shared/watch";
import { formatValue, fieldValidator, type DataField } from "../shared/widget";
import { mailReady, queueEmail, widgetLink } from "./watchMail";

export async function requireWatch(ctx: MutationCtx, watchId: Id<"watches">) {
  const ownerId = await requireUser(ctx);
  const watch = await ctx.db.get("watches", watchId);
  if (!watch || watch.ownerId !== ownerId)
    throw new ConvexError("Email watch not found.");
  return watch;
}

export function baseline(
  condition: Doc<"watches">["condition"],
  fields: DataField[],
) {
  const field = fields.find((item) => item.id === condition.fieldId);
  const fresh =
    field && !field.stale && field.value !== null && field.observedAt !== null;
  return {
    lastValue: fresh ? field.value : null,
    lastMatched: fresh ? matchesCondition(condition, field.value) : null,
  };
}

export const get = query({
  args: { widgetId: v.id("widgets") },
  returns: v.object({
    watches: v.array(schema.doc("watches")),
    recipient: v.union(v.string(), v.null()),
    configured: v.boolean(),
  }),
  handler: async (ctx, { widgetId }) => {
    const widget = await requireWidget(ctx, widgetId);
    const user = await ctx.db.get("users", widget.ownerId);
    const watches = await ctx.db
      .query("watches")
      .withIndex("by_widgetId", (q) => q.eq("widgetId", widgetId))
      .collect();
    return {
      watches,
      recipient: user?.email ? emailAddress(user.email) : null,
      configured: mailReady(),
    };
  },
});

export const save = mutation({
  args: {
    widgetId: v.id("widgets"),
    condition: conditionValidator,
  },
  returns: v.id("watches"),
  handler: async (ctx, args) => {
    const widget = await requireWidget(ctx, args.widgetId);
    const source = await ctx.db.get("sources", widget.sourceId);
    if (!source || source.status !== "ready")
      throw new ConvexError("Wait for the source to be ready.");
    try {
      validateCondition(args.condition, source.fields);
    } catch (error) {
      throw new ConvexError(
        error instanceof Error ? error.message : "Invalid condition.",
      );
    }
    const watches = await ctx.db
      .query("watches")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", source._id))
      .take(20);
    if (watches.length === 20)
      throw new ConvexError("This source already has 20 email watches.");
    const user = await ctx.db.get("users", widget.ownerId);
    const recipient = user?.email ? emailAddress(user.email) : "";
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient))
      throw new ConvexError(
        "Your account needs an email address to use email watches.",
      );
    const watchId = await ctx.db.insert("watches", {
      widgetId: widget._id,
      sourceId: source._id,
      ownerId: widget.ownerId,
      recipient,
      condition: args.condition,
      revision: 1,
      enabled: true,
      verifiedAt: Date.now(),
      ...baseline(args.condition, source.fields),
      lastNotifiedAt: null,
      lastConfirmationAt: Date.now(),
      deliveryError: null,
    });
    return watchId;
  },
});

export const setEnabled = mutation({
  args: { watchId: v.id("watches"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const watch = await requireWatch(ctx, args.watchId);
    const source = await ctx.db.get("sources", watch.sourceId);
    if (!source) throw new ConvexError("Source not found.");
    await ctx.db.patch("watches", watch._id, {
      enabled: args.enabled,
      revision: watch.revision + 1,
      ...baseline(watch.condition, source.fields),
    });
    return null;
  },
});

export async function removeWidgetWatch(
  ctx: MutationCtx,
  widgetId: Id<"widgets">,
) {
  const watches = await ctx.db
    .query("watches")
    .withIndex("by_widgetId", (q) => q.eq("widgetId", widgetId))
    .collect();
  for (const watch of watches) {
    await ctx.db.delete("watches", watch._id);
    await ctx.scheduler.runAfter(0, internal.watchMail.cleanupWatch, {
      watchId: watch._id,
    });
  }
}

export const remove = mutation({
  args: { watchId: v.id("watches") },
  returns: v.null(),
  handler: async (ctx, { watchId }) => {
    const watch = await requireWatch(ctx, watchId);
    await ctx.db.delete("watches", watch._id);
    await ctx.scheduler.runAfter(0, internal.watchMail.cleanupWatch, {
      watchId: watch._id,
    });
    return null;
  },
});

export async function evaluateSourceWatches(
  ctx: MutationCtx,
  source: Doc<"sources">,
  fields: DataField[],
) {
  const watches = await ctx.db
    .query("watches")
    .withIndex("by_sourceId", (q) => q.eq("sourceId", source._id))
    .take(20);
  for (const watch of watches) {
    if (!watch.enabled) continue;
    const field = fields.find((item) => item.id === watch.condition.fieldId);
    const result = evaluateWatch(
      watch.condition,
      field,
      watch.lastValue,
      watch.lastMatched,
    );
    await ctx.db.patch("watches", watch._id, {
      lastValue: result.lastValue,
      lastMatched: result.lastMatched,
    });
    if (!result.trigger || !field) continue;
    const widget = await ctx.db.get("widgets", watch.widgetId);
    if (!widget) continue;
    if (!mailReady()) {
      await ctx.db.patch("watches", watch._id, {
        deliveryError:
          "Email watches are not configured. Your widget will keep refreshing.",
      });
      continue;
    }
    await queueEmail(
      ctx,
      watch,
      "alert",
      `${widget.name} · ${describeCondition(watch.condition, fields)}`,
      `${describeCondition(watch.condition, fields)}.\n\nPrevious: ${formatValue({ ...field, value: watch.lastValue }, 2)}\nNow: ${formatValue(field, 2)}\n\nSource: ${source.url}\nOpen widget: ${widgetLink(widget._id)}\n\nReply "Stop" to stop emails or reply with an edit to this condition.`,
    );
  }
}

export const evaluate = internalMutation({
  args: {
    sourceId: v.id("sources"),
    run: v.number(),
    fields: v.array(fieldValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db.get("sources", args.sourceId);
    if (source && source.refreshRun === args.run)
      await evaluateSourceWatches(ctx, source, args.fields);
    return null;
  },
});

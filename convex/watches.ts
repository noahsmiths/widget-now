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
    watch: v.union(schema.doc("watches"), v.null()),
    recipient: v.union(v.string(), v.null()),
    configured: v.boolean(),
  }),
  handler: async (ctx, { widgetId }) => {
    const widget = await requireWidget(ctx, widgetId);
    const user = await ctx.db.get("users", widget.ownerId);
    const watch = await ctx.db
      .query("watches")
      .withIndex("by_widgetId", (q) => q.eq("widgetId", widgetId))
      .unique();
    return {
      watch,
      recipient: user?.email ? emailAddress(user.email) : null,
      configured: mailReady(),
    };
  },
});

async function confirmation(
  ctx: MutationCtx,
  watch: Doc<"watches">,
  source: Doc<"sources">,
  name: string,
) {
  await queueEmail(
    ctx,
    watch,
    "confirmation",
    `Confirm your email watch · ${name}`,
    `You asked Widget Now to email you when ${describeCondition(watch.condition, source.fields)}.\n\nReply CONFIRM to this email to start watching. Until then, no alerts will be sent.\n\nOpen widget: ${widgetLink(watch.widgetId)}\nSource: ${source.url}\n\nAfter confirming, reply PAUSE, RESUME, or LATEST, or describe a new condition. If you did not request this, ignore this email.`,
  );
}

export const save = mutation({
  args: {
    widgetId: v.id("widgets"),
    condition: conditionValidator,
    expectedRevision: v.union(v.number(), v.null()),
  },
  returns: v.id("watches"),
  handler: async (ctx, args) => {
    const widget = await requireWidget(ctx, args.widgetId);
    const source = await ctx.db.get("sources", widget.sourceId);
    if (!source || source.status !== "ready")
      throw new ConvexError("Wait for the source to be ready.");
    if (!mailReady())
      throw new ConvexError("Email watches are not configured yet.");
    try {
      validateCondition(args.condition, source.fields);
    } catch (error) {
      throw new ConvexError(
        error instanceof Error ? error.message : "Invalid condition.",
      );
    }
    const existing = await ctx.db
      .query("watches")
      .withIndex("by_widgetId", (q) => q.eq("widgetId", widget._id))
      .unique();
    if ((existing?.revision ?? null) !== args.expectedRevision)
      throw new ConvexError(
        "This watch changed. Review its latest condition and try again.",
      );
    if (existing) {
      if (!existing.verifiedAt)
        throw new ConvexError("Confirm your email before changing this watch.");
      await ctx.db.patch("watches", existing._id, {
        condition: args.condition,
        revision: existing.revision + 1,
        deliveryError: null,
        ...baseline(args.condition, source.fields),
      });
      return existing._id;
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
      enabled: false,
      verifiedAt: null,
      ...baseline(args.condition, source.fields),
      lastNotifiedAt: null,
      lastConfirmationAt: Date.now(),
      deliveryError: null,
    });
    const watch = (await ctx.db.get("watches", watchId))!;
    await confirmation(ctx, watch, source, widget.name);
    return watchId;
  },
});

export const setEnabled = mutation({
  args: { watchId: v.id("watches"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const watch = await requireWatch(ctx, args.watchId);
    if (args.enabled && !watch.verifiedAt)
      throw new ConvexError("Reply CONFIRM to your confirmation email first.");
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

export const resendConfirmation = mutation({
  args: { watchId: v.id("watches") },
  returns: v.null(),
  handler: async (ctx, { watchId }) => {
    const watch = await requireWatch(ctx, watchId);
    if (watch.verifiedAt)
      throw new ConvexError("Your email is already confirmed.");
    if (Date.now() - watch.lastConfirmationAt < 5 * 60_000)
      throw new ConvexError("Please wait five minutes before resending.");
    if (!mailReady())
      throw new ConvexError("Email watches are not configured yet.");
    const source = await ctx.db.get("sources", watch.sourceId);
    const widget = await ctx.db.get("widgets", watch.widgetId);
    if (!source || !widget) throw new ConvexError("Widget not found.");
    await ctx.db.patch("watches", watchId, {
      lastConfirmationAt: Date.now(),
      deliveryError: null,
    });
    await confirmation(ctx, watch, source, widget.name);
    return null;
  },
});

export async function removeWidgetWatch(
  ctx: MutationCtx,
  widgetId: Id<"widgets">,
) {
  const watch = await ctx.db
    .query("watches")
    .withIndex("by_widgetId", (q) => q.eq("widgetId", widgetId))
    .unique();
  if (watch) {
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
    await removeWidgetWatch(ctx, watch.widgetId);
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
    if (!watch.enabled || !watch.verifiedAt) continue;
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
      `${describeCondition(watch.condition, fields)}.\n\nPrevious: ${formatValue({ ...field, value: watch.lastValue }, 2)}\nNow: ${formatValue(field, 2)}\nObserved: ${new Date(field.observedAt!).toISOString()}\n\nSource evidence: ${field.excerpt}\nSource: ${source.url}\nOpen widget: ${widgetLink(widget._id)}\n\nReply PAUSE to stop alerts, RESUME to restart, LATEST for the last observed value, or describe a new condition.`,
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

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import schema from "./schema";
import { mailWorkflow } from "./mailWorkflows";
import {
  commandValidator,
  describeCondition,
  validateCondition,
} from "../shared/watch";
import { formatValue } from "../shared/widget";
import { baseline } from "./watches";
import { queueEmail, widgetLink } from "./watchMail";
import { vResultValidator, vWorkflowId } from "@convex-dev/workflow";

export const accept = internalMutation({
  args: { inboxId: v.string(), threadId: v.string(), messageId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("watchReplies")
      .withIndex("by_inboxId_and_messageId", (q) =>
        q.eq("inboxId", args.inboxId).eq("messageId", args.messageId),
      )
      .unique();
    if (duplicate) return null;
    const email = await ctx.db
      .query("watchEmails")
      .withIndex("by_inboxId_and_threadId", (q) =>
        q.eq("inboxId", args.inboxId).eq("threadId", args.threadId),
      )
      .order("desc")
      .first();
    if (!email || email.status !== "sent") return null;
    const watch = await ctx.db.get("watches", email.watchId);
    if (!watch) return null;
    const replyId = await ctx.db.insert("watchReplies", {
      ...args,
      watchId: watch._id,
      watchRevision: watch.revision,
      status: "queued",
      workflowId: null,
    });
    const workflowId = await mailWorkflow.start(
      ctx,
      internal.mailWorkflows.reply,
      { replyId },
      {
        onComplete: internal.watchReplies.completed,
        context: { replyId },
      },
    );
    await ctx.db.patch("watchReplies", replyId, { workflowId });
    return null;
  },
});

export const context = internalQuery({
  args: { replyId: v.id("watchReplies") },
  returns: v.union(
    v.object({
      reply: schema.doc("watchReplies"),
      watch: schema.doc("watches"),
      source: schema.doc("sources"),
      widget: schema.doc("widgets"),
    }),
    v.null(),
  ),
  handler: async (ctx, { replyId }) => {
    const reply = await ctx.db.get("watchReplies", replyId);
    if (!reply || reply.status !== "queued") return null;
    const watch = await ctx.db.get("watches", reply.watchId);
    if (!watch) return null;
    const source = await ctx.db.get("sources", watch.sourceId);
    const widget = await ctx.db.get("widgets", watch.widgetId);
    return source && widget ? { reply, watch, source, widget } : null;
  },
});

export const ignore = internalMutation({
  args: { replyId: v.id("watchReplies") },
  returns: v.null(),
  handler: async (ctx, { replyId }) => {
    const reply = await ctx.db.get("watchReplies", replyId);
    if (reply?.status === "queued")
      await ctx.db.patch("watchReplies", replyId, { status: "ignored" });
    return null;
  },
});

export const apply = internalMutation({
  args: { replyId: v.id("watchReplies"), command: commandValidator },
  returns: v.null(),
  handler: async (ctx, { replyId, command }) => {
    const reply = await ctx.db.get("watchReplies", replyId);
    if (!reply || reply.status !== "queued") return null;
    const watch = await ctx.db.get("watches", reply.watchId);
    if (!watch) {
      await ctx.db.patch("watchReplies", replyId, { status: "ignored" });
      return null;
    }
    const source = await ctx.db.get("sources", watch.sourceId);
    if (!source) return null;
    let text: string;
    let updated = watch;
    if (watch.revision !== reply.watchRevision) {
      text = `This watch changed while your reply was being processed. Its current condition is: ${describeCondition(watch.condition, source.fields)}. Please reply again with your instruction.`;
    } else if (command.kind === "confirm" && !watch.verifiedAt) {
      const patch = {
        enabled: true,
        verifiedAt: Date.now(),
        revision: watch.revision + 1,
        ...baseline(watch.condition, source.fields),
      };
      await ctx.db.patch("watches", watch._id, patch);
      updated = { ...watch, ...patch };
      text = `Confirmed. I'll email you when ${describeCondition(watch.condition, source.fields)}. Checks run with your widget's 15-minute refresh. If the condition is already true, I'll wait for it to become false and then true again.\n\nReply PAUSE, RESUME, LATEST, or describe a new condition.`;
    } else if (command.kind === "pause") {
      const patch = { enabled: false, revision: watch.revision + 1 };
      await ctx.db.patch("watches", watch._id, patch);
      updated = { ...watch, ...patch };
      text = watch.verifiedAt
        ? "Your email watch is paused. Your widget will keep refreshing. Reply RESUME to restart alerts."
        : "Your email watch is paused. No alerts will be sent. Reply CONFIRM if you decide to enable it.";
    } else if (!watch.verifiedAt) {
      text =
        "Reply CONFIRM to verify your email address and enable this watch first.";
    } else if (command.kind === "resume") {
      const patch = {
        enabled: true,
        revision: watch.revision + 1,
        ...baseline(watch.condition, source.fields),
      };
      await ctx.db.patch("watches", watch._id, patch);
      updated = { ...watch, ...patch };
      text = `Your email watch is active again: ${describeCondition(watch.condition, source.fields)}. I'll watch for future changes or crossings.`;
    } else if (command.kind === "latest") {
      const field = source.fields.find(
        (item) => item.id === watch.condition.fieldId,
      );
      text = `Latest observed ${field?.label ?? "value"}: ${formatValue(field, 2)}.\nObserved: ${field?.observedAt != null ? new Date(field.observedAt).toISOString() : "not available"}.${field?.stale ? "\nThis value is stale; it is the last successful observation." : ""}\nSource evidence: ${field?.excerpt ?? ""}\nSource: ${source.url}`;
    } else if (command.kind === "update" && command.condition) {
      try {
        validateCondition(command.condition, source.fields);
        const patch = {
          condition: command.condition,
          revision: watch.revision + 1,
          ...baseline(command.condition, source.fields),
        };
        await ctx.db.patch("watches", watch._id, patch);
        updated = { ...watch, ...patch };
        text = `Done. Your condition is now: ${describeCondition(command.condition, source.fields)}.\nThe watch is ${watch.enabled ? "active" : "paused"}. I'll watch for future changes or crossings.`;
      } catch {
        text =
          "I couldn't apply that condition. Use one existing field with a numeric threshold, a matching value, text it contains, or a value change.";
      }
    } else {
      text = `Your watch is ${watch.enabled ? "active" : "paused"}: ${describeCondition(watch.condition, source.fields)}.\n\nReply PAUSE, RESUME, or LATEST. To change the condition, describe one field changing, crossing a numeric threshold, matching a value, or containing text. I can't edit widget designs, source values, recipients, or check schedules through email.`;
    }
    await queueEmail(
      ctx,
      updated,
      "reply",
      "Your Widget Now email watch",
      `${text}\n\nOpen widget: ${widgetLink(watch.widgetId)}`,
      reply.messageId,
    );
    await ctx.db.patch("watchReplies", replyId, { status: "processed" });
    return null;
  },
});

export const completed = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ replyId: v.id("watchReplies") }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reply = await ctx.db.get("watchReplies", args.context.replyId);
    if (reply?.status === "queued" && args.result.kind !== "success")
      await ctx.db.patch("watchReplies", reply._id, { status: "failed" });
    await ctx.scheduler.runAfter(1000, internal.watchMail.cleanupWorkflow, {
      workflowId: args.workflowId,
    });
    return null;
  },
});

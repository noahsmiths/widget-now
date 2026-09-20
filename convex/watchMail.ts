import { v } from "convex/values";
import {
  env,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { mailWorkflow } from "./mailWorkflows";
import { escapeHtml } from "../shared/watch";
import { vResultValidator, vWorkflowId } from "@convex-dev/workflow";

export function mailReady() {
  return Boolean(
    env.AGENTMAIL_API_KEY &&
    env.AGENTMAIL_INBOX_ID &&
    env.AGENTMAIL_WEBHOOK_SECRET,
  );
}

export function widgetLink(widgetId: Id<"widgets">) {
  const base = env.APP_URL ?? "http://localhost:5173";
  const url = new URL(base);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("APP_URL must use HTTPS, or HTTP on localhost.");
  url.hash = `widget=${widgetId}`;
  return url.href;
}

export async function queueEmail(
  ctx: MutationCtx,
  watch: Doc<"watches">,
  kind: Doc<"watchEmails">["kind"],
  subject: string,
  text: string,
  replyToMessageId: string | null = null,
) {
  if (!env.AGENTMAIL_INBOX_ID)
    throw new Error("Email watches are not configured yet.");
  const emailId = await ctx.db.insert("watchEmails", {
    watchId: watch._id,
    watchRevision: watch.revision,
    kind,
    inboxId: env.AGENTMAIL_INBOX_ID,
    recipient: watch.recipient,
    subject,
    text,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</div>`,
    replyToMessageId,
    threadId: null,
    messageId: null,
    status: "queued",
    error: null,
    workflowId: null,
  });
  const workflowId = await mailWorkflow.start(
    ctx,
    internal.mailWorkflows.deliver,
    { emailId },
    {
      onComplete: internal.watchMail.deliveryCompleted,
      context: { emailId },
    },
  );
  await ctx.db.patch("watchEmails", emailId, { workflowId });
  return emailId;
}

export const readEmail = internalQuery({
  args: { emailId: v.id("watchEmails") },
  returns: v.union(schema.doc("watchEmails"), v.null()),
  handler: async (ctx, { emailId }) => {
    const email = await ctx.db.get("watchEmails", emailId);
    if (!email || email.status !== "queued") return null;
    const watch = await ctx.db.get("watches", email.watchId);
    if (!watch) return null;
    if (email.kind !== "reply" && email.watchRevision !== watch.revision)
      return null;
    if (email.kind === "alert" && (!watch.enabled || !watch.verifiedAt))
      return null;
    if (email.kind === "confirmation" && watch.verifiedAt) return null;
    return email;
  },
});

export const sent = internalMutation({
  args: {
    emailId: v.id("watchEmails"),
    threadId: v.string(),
    messageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await ctx.db.get("watchEmails", args.emailId);
    if (!email || email.status === "sent") return null;
    await ctx.db.patch("watchEmails", email._id, {
      status: "sent",
      threadId: args.threadId,
      messageId: args.messageId,
      error: null,
    });
    const watch = await ctx.db.get("watches", email.watchId);
    if (watch && email.watchRevision === watch.revision)
      await ctx.db.patch("watches", watch._id, {
        deliveryError: null,
        ...(email.kind === "alert" ? { lastNotifiedAt: Date.now() } : {}),
      });
    return null;
  },
});

export const cancelEmail = internalMutation({
  args: { emailId: v.id("watchEmails") },
  returns: v.null(),
  handler: async (ctx, { emailId }) => {
    const email = await ctx.db.get("watchEmails", emailId);
    if (email?.status === "queued")
      await ctx.db.patch("watchEmails", emailId, { status: "canceled" });
    return null;
  },
});

export const deliveryCompleted = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ emailId: v.id("watchEmails") }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await ctx.db.get("watchEmails", args.context.emailId);
    if (email?.status === "queued" && args.result.kind !== "success") {
      const error =
        "Email could not be delivered. Your widget will keep refreshing.";
      await ctx.db.patch("watchEmails", email._id, { status: "failed", error });
      const watch = await ctx.db.get("watches", email.watchId);
      if (watch && watch.revision === email.watchRevision)
        await ctx.db.patch("watches", watch._id, { deliveryError: error });
    }
    await ctx.scheduler.runAfter(1000, internal.watchMail.cleanupWorkflow, {
      workflowId: args.workflowId,
    });
    return null;
  },
});

export const cleanupWorkflow = internalMutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, args) => {
    await mailWorkflow.cleanup(ctx, args.workflowId);
    return null;
  },
});

export const cleanupWatch = internalMutation({
  args: { watchId: v.id("watches") },
  returns: v.null(),
  handler: async (ctx, { watchId }) => {
    for (const table of ["watchEmails", "watchReplies"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_watchId", (q) => q.eq("watchId", watchId))
        .take(50);
      for (const row of rows) await ctx.db.delete(table, row._id);
      if (rows.length === 50)
        await ctx.scheduler.runAfter(0, internal.watchMail.cleanupWatch, {
          watchId,
        });
    }
    return null;
  },
});

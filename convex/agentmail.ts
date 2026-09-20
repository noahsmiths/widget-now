"use node";

import { InboxesClient } from "agentmail/inboxes";
import { Webhook } from "svix";
import { convert } from "html-to-text";
import { z } from "zod";
import { v } from "convex/values";
import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  commandValidator,
  emailAddress,
  type WatchCommand,
} from "../shared/watch";

function client() {
  if (!env.AGENTMAIL_API_KEY) throw new Error("AgentMail is not configured.");
  return new InboxesClient({ apiKey: env.AGENTMAIL_API_KEY });
}

export const deliver = internalAction({
  args: { emailId: v.id("watchEmails") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await ctx.runQuery(internal.watchMail.readEmail, args);
    if (!email) {
      await ctx.runMutation(internal.watchMail.cancelEmail, args);
      return null;
    }
    if (Date.now() - email._creationTime > 23 * 60 * 60_000)
      throw new Error("This email is too old to retry safely.");
    const options = {
      headers: { "Idempotency-Key": `widget-now-${email._id}` },
      timeoutInSeconds: 30,
    };
    const message = email.replyToMessageId
      ? await client().messages.reply(
          email.inboxId,
          email.replyToMessageId,
          {
            to: [email.recipient],
            replyAll: false,
            text: email.text,
            html: email.html,
          },
          options,
        )
      : await client().messages.send(
          email.inboxId,
          {
            to: [email.recipient],
            subject: email.subject,
            text: email.text,
            html: email.html,
          },
          options,
        );
    await ctx.runMutation(internal.watchMail.sent, {
      emailId: email._id,
      threadId: message.threadId,
      messageId: message.messageId,
    });
    return null;
  },
});

const webhookSchema = z.object({
  event_type: z.literal("message.received"),
  message: z.object({
    inbox_id: z.string().max(320),
    thread_id: z.string().max(1000),
    message_id: z.string().max(1000),
  }),
});

export const verifyWebhook = internalAction({
  args: {
    body: v.string(),
    headers: v.object({
      id: v.string(),
      timestamp: v.string(),
      signature: v.string(),
    }),
  },
  returns: v.union(
    v.object({
      inboxId: v.string(),
      threadId: v.string(),
      messageId: v.string(),
    }),
    v.null(),
  ),
  handler: async (_ctx, args) => {
    if (!env.AGENTMAIL_WEBHOOK_SECRET)
      throw new Error("AgentMail webhooks are not configured.");
    new Webhook(env.AGENTMAIL_WEBHOOK_SECRET).verify(args.body, {
      "svix-id": args.headers.id,
      "svix-timestamp": args.headers.timestamp,
      "svix-signature": args.headers.signature,
    });
    const payload: unknown = JSON.parse(args.body);
    const event = webhookSchema.safeParse(payload);
    if (
      !event.success ||
      event.data.message.inbox_id !== env.AGENTMAIL_INBOX_ID
    )
      return null;
    return {
      inboxId: event.data.message.inbox_id,
      threadId: event.data.message.thread_id,
      messageId: event.data.message.message_id,
    };
  },
});

export const readReply = internalAction({
  args: { replyId: v.id("watchReplies") },
  returns: v.union(commandValidator, v.null()),
  handler: async (ctx, args): Promise<WatchCommand | null> => {
    const data = await ctx.runQuery(internal.watchReplies.context, args);
    if (!data) return null;
    const { reply, watch, source } = data;
    const message = await client().messages.get(reply.inboxId, reply.messageId);
    const headers = Object.fromEntries(
      Object.entries(message.headers ?? {}).map(([key, value]) => [
        key.toLowerCase(),
        value.toLowerCase(),
      ]),
    );
    if (
      message.threadId !== reply.threadId ||
      message.inboxId !== reply.inboxId ||
      emailAddress(message.from) !== watch.recipient ||
      !message.labels.includes("received") ||
      message.labels.some((label) =>
        ["spam", "blocked", "unauthenticated"].includes(label),
      ) ||
      (headers["auto-submitted"] && headers["auto-submitted"] !== "no") ||
      ["bulk", "list", "junk"].includes(headers.precedence ?? "")
    ) {
      await ctx.runMutation(internal.watchReplies.ignore, args);
      return null;
    }
    const text =
      message.extractedText ??
      (message.extractedHtml
        ? convert(message.extractedHtml)
        : (message.text ?? (message.html ? convert(message.html) : "")));
    if (!text.trim() || text.length > 2000)
      return { kind: "help", condition: null };
    return ctx.runAction(internal.watchAi.interpret, {
      ownerId: watch.ownerId,
      fields: source.fields,
      current: watch.condition,
      instruction: text,
    });
  },
});

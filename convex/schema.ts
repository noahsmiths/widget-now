import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { definitionValidator, fieldValidator } from "../shared/widget";
import { conditionValidator } from "../shared/watch";

export default defineSchema({
  users: defineTable({
    email: v.optional(v.string()),
  }),
  numbers: defineTable({
    value: v.number(),
  }),
  sources: defineTable({
    ownerId: v.id("users"),
    url: v.string(),
    blurb: v.string(),
    title: v.string(),
    fields: v.array(fieldValidator),
    candidates: v.array(definitionValidator),
    status: v.union(
      v.literal("scraping"),
      v.literal("extracting"),
      v.literal("designing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    error: v.union(v.string(), v.null()),
    run: v.number(),
    workflowId: v.union(v.string(), v.null()),
    failedStage: v.optional(v.string()),
    savedCount: v.number(),
    nextRefreshAt: v.union(v.number(), v.null()),
    refreshing: v.boolean(),
    refreshRun: v.number(),
    refreshError: v.union(v.string(), v.null()),
    lastAttemptAt: v.union(v.number(), v.null()),
    lastSuccessAt: v.union(v.number(), v.null()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_savedCount", ["ownerId", "savedCount"])
    .index("by_nextRefreshAt", ["nextRefreshAt"]),
  widgets: defineTable({
    ownerId: v.id("users"),
    sourceId: v.id("sources"),
    name: v.string(),
    definition: definitionValidator,
    revision: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_sourceId", ["sourceId"]),
  watches: defineTable({
    ownerId: v.id("users"),
    widgetId: v.id("widgets"),
    sourceId: v.id("sources"),
    recipient: v.string(),
    condition: conditionValidator,
    revision: v.number(),
    enabled: v.boolean(),
    verifiedAt: v.union(v.number(), v.null()),
    lastValue: v.union(v.string(), v.number(), v.boolean(), v.null()),
    lastMatched: v.union(v.boolean(), v.null()),
    lastNotifiedAt: v.union(v.number(), v.null()),
    lastConfirmationAt: v.number(),
    deliveryError: v.union(v.string(), v.null()),
  })
    .index("by_widgetId", ["widgetId"])
    .index("by_sourceId", ["sourceId"]),
  watchEmails: defineTable({
    watchId: v.id("watches"),
    watchRevision: v.number(),
    kind: v.union(
      v.literal("confirmation"),
      v.literal("alert"),
      v.literal("reply"),
    ),
    inboxId: v.string(),
    recipient: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.string(),
    replyToMessageId: v.union(v.string(), v.null()),
    threadId: v.union(v.string(), v.null()),
    messageId: v.union(v.string(), v.null()),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("canceled"),
    ),
    error: v.union(v.string(), v.null()),
    workflowId: v.union(v.string(), v.null()),
  })
    .index("by_inboxId_and_threadId", ["inboxId", "threadId"])
    .index("by_watchId", ["watchId"]),
  watchReplies: defineTable({
    watchId: v.id("watches"),
    inboxId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    watchRevision: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("processed"),
      v.literal("ignored"),
      v.literal("failed"),
    ),
    workflowId: v.union(v.string(), v.null()),
  })
    .index("by_inboxId_and_messageId", ["inboxId", "messageId"])
    .index("by_watchId", ["watchId"]),
});

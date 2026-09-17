import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { definitionValidator, fieldValidator } from "../shared/widget";

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
});

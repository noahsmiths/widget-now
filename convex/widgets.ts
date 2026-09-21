import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { requireSource, requireUser, requireWidget } from "./access";
import { definitionValidator, validateDefinition } from "../shared/widget";
import { removeWidgetWatch } from "./watches";

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("widgets")),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    return ctx.db
      .query("widgets")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const get = query({
  args: { widgetId: v.id("widgets") },
  returns: v.object({
    widget: schema.doc("widgets"),
    source: schema.doc("sources"),
  }),
  handler: async (ctx, args) => {
    const widget = await requireWidget(ctx, args.widgetId);
    const source = await requireSource(ctx, widget.sourceId);
    return { widget, source };
  },
});

export const forSource = query({
  args: { sourceId: v.id("sources") },
  returns: v.union(v.id("widgets"), v.null()),
  handler: async (ctx, args) => {
    await requireSource(ctx, args.sourceId);
    const widget = await ctx.db
      .query("widgets")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .first();
    return widget?._id ?? null;
  },
});

export const save = mutation({
  args: {
    sourceId: v.id("sources"),
    name: v.string(),
    definition: definitionValidator,
    widgetId: v.optional(v.id("widgets")),
    expectedRevision: v.optional(v.number()),
  },
  returns: v.object({ widgetId: v.id("widgets"), revision: v.number() }),
  handler: async (ctx, args) => {
    const source = await requireSource(ctx, args.sourceId);
    if (source.status !== "ready")
      throw new ConvexError("Wait for generation to finish before saving.");
    const name = args.name.trim();
    if (!name || name.length > 100)
      throw new ConvexError("Use a widget name between 1 and 100 characters.");
    validateDefinition(args.definition, source.fields);
    if (args.widgetId) {
      const widget = await requireWidget(ctx, args.widgetId);
      if (widget.sourceId !== args.sourceId)
        throw new ConvexError("The widget source cannot be changed.");
      if (widget.revision !== args.expectedRevision)
        throw new ConvexError(
          "This widget changed in another session. Reopen it to load the latest design; your edits have not been saved.",
        );
      const revision = widget.revision + 1;
      await ctx.db.patch("widgets", widget._id, {
        name,
        definition: args.definition,
        revision,
        updatedAt: Date.now(),
      });
      return { widgetId: widget._id, revision };
    }
    const existingWidget = await ctx.db
      .query("widgets")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", source._id))
      .first();
    if (source.savedCount > 0 || existingWidget)
      throw new ConvexError("This generation already has a widget. Open it to make edits.");
    const widgetId = await ctx.db.insert("widgets", {
      ownerId: source.ownerId,
      sourceId: source._id,
      name,
      definition: args.definition,
      revision: 1,
      updatedAt: Date.now(),
    });
    await ctx.db.patch("sources", source._id, {
      savedCount: 1,
      candidates: [],
      nextRefreshAt: source.refreshing
        ? null
        : (source.nextRefreshAt ?? Date.now() + 15 * 60_000),
    });
    return { widgetId, revision: 1 };
  },
});

export const remove = mutation({
  args: { widgetId: v.id("widgets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const widget = await requireWidget(ctx, args.widgetId);
    const source = await requireSource(ctx, widget.sourceId);
    await removeWidgetWatch(ctx, widget._id);
    await ctx.db.delete("widgets", widget._id);
    if (source.savedCount === 1) {
      await ctx.db.delete("sources", source._id);
    } else {
      await ctx.db.patch("sources", source._id, {
        savedCount: source.savedCount - 1,
      });
    }
    return null;
  },
});

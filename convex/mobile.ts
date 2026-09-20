import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser, requireWidget, requireSource } from "./access";
import { definitionValidator, fieldValidator, sizeValidator } from "../shared/widget";

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({
    id: v.id("widgets"),
    name: v.string(),
    size: sizeValidator,
  })),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const result = await ctx.db
      .query("widgets")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((widget) => ({
        id: widget._id,
        name: widget.name,
        size: widget.definition.size,
      })),
    };
  },
});

export const get = query({
  args: { widgetId: v.id("widgets") },
  returns: v.object({
    id: v.id("widgets"),
    name: v.string(),
    definition: definitionValidator,
    fields: v.array(fieldValidator),
    updatedAt: v.number(),
    lastSuccessAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const widget = await requireWidget(ctx, args.widgetId);
    const source = await requireSource(ctx, widget.sourceId);
    return {
      id: widget._id,
      name: widget.name,
      definition: widget.definition,
      fields: source.fields,
      updatedAt: widget.updatedAt,
      lastSuccessAt: source.lastSuccessAt,
    };
  },
});

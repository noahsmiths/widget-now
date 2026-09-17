import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/core";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Sign in to use Widget Now.");
  return userId;
}

export async function requireSource(
  ctx: QueryCtx | MutationCtx,
  id: Id<"sources">,
) {
  const userId = await requireUser(ctx);
  const source = await ctx.db.get("sources", id);
  if (!source || source.ownerId !== userId)
    throw new ConvexError("Source not found.");
  return source;
}

export async function requireWidget(
  ctx: QueryCtx | MutationCtx,
  id: Id<"widgets">,
) {
  const userId = await requireUser(ctx);
  const widget = await ctx.db.get("widgets", id);
  if (!widget || widget.ownerId !== userId)
    throw new ConvexError("Widget not found.");
  return widget;
}

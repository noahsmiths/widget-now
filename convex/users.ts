import { vGithubProfile } from "@convex-dev/auth/providers/oauth/github";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const createUserPassword = internalMutation({
  args: {
    provider: v.literal("password"),
    providerAccountId: v.string(),
    profile: v.object({ username: v.string() }),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", { email: args.profile.username });
  },
});

export const createUserGithub = internalMutation({
  args: {
    provider: v.literal("github"),
    providerAccountId: v.string(),
    profile: vGithubProfile,
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    return await ctx.db.insert(
      "users",
      args.profile.email === undefined ? {} : { email: args.profile.email },
    );
  },
});

import { setupCore } from "@convex-dev/auth/core/setup";
import { setupGithub } from "@convex-dev/auth/providers/oauth/github";
import { setupUsernamePassword } from "@convex-dev/auth/providers/password/setup";
import { components, internal } from "./_generated/api";
import { env } from "./_generated/server";

const core = setupCore({ component: components.auth });

export const { signOut, refreshSession, isAuthenticated } = core;

export const { signUpWithPassword, signInWithPassword } = setupUsernamePassword(
  core,
  {
    component: components.authPasswordProvider,
    usernameComponent: components.authUsername,
  },
).attachUserCallbacks({ createUser: internal.users.createUserPassword });

export const { startSignInGithub, completeSignInGithub } = setupGithub(core, {
  component: components.oauthGithub,
  allowedRedirectOrigins: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    env.CONVEX_SITE_URL,
  ],
}).attachUserCallbacks({ createUser: internal.users.createUserGithub });

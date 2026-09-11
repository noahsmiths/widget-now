import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/core/convex.config.js";
import passwordProvider from "@convex-dev/auth/providers/password/convex.config.js";
import oauth from "@convex-dev/auth/providers/oauth/convex.config.js";
import username from "@convex-dev/auth/username/convex.config.js";

const app = defineApp({
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
  },
});

app.use(auth, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
});

app.use(passwordProvider);
app.use(username);
app.use(oauth, {
  name: "oauthGithub",
  httpPrefix: "/oauth/github",
  env: {
    CLIENT_ID: app.env.AUTH_GITHUB_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GITHUB_CLIENT_SECRET,
  },
});

export default app;

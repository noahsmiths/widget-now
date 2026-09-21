import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpAction, env } from "./_generated/server";
import { components, internal } from "./_generated/api";

const http = httpRouter();
http.route({
  path: "/mobile/oauth/finish",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const params = new URL(request.url).searchParams;
    const code = params.get("convexAuthCode");
    const error = params.get("convexAuthError");
    if ((code === null && error === null) || (code !== null && error !== null))
      return new Response("Invalid sign-in callback.", { status: 400 });
    const target = new URL("widgetnow://oauth");
    if (code !== null) target.searchParams.set("convexAuthCode", code);
    if (error !== null) target.searchParams.set("convexAuthError", error);
    return new Response(null, {
      status: 302,
      headers: {
        Location: target.toString(),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }),
});

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!env.AGENTMAIL_WEBHOOK_SECRET)
      return new Response("Email watches are not configured.", { status: 503 });
    const body = await request.text();
    if (body.length > 1_100_000)
      return new Response("Payload too large.", { status: 413 });
    let event;
    try {
      event = await ctx.runAction(internal.agentmail.verifyWebhook, {
        body,
        headers: {
          id: request.headers.get("svix-id") ?? "",
          timestamp: request.headers.get("svix-timestamp") ?? "",
          signature: request.headers.get("svix-signature") ?? "",
        },
      });
    } catch {
      return new Response("Invalid webhook signature.", { status: 401 });
    }
    if (event) await ctx.runMutation(internal.watchReplies.accept, event);
    return new Response(null, { status: 204 });
  }),
});

registerStaticRoutes(http, components.staticHosting);

export default http;

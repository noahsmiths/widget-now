import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 4,
    retryActionsByDefault: true,
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
  },
});

export const generate = workflow.define({
  args: { sourceId: v.id("sources"), run: v.number() },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const page = await step.runAction(internal.pipeline.scrape, {
      ...args,
      refresh: false,
    });
    const fields = await step.runAction(internal.pipeline.extract, {
      ...args,
      markdown: page.markdown,
      refresh: false,
    });
    const candidates = await step.runAction(internal.pipeline.design, {
      ...args,
      fields,
    });
    await step.runMutation(internal.sources.finishGeneration, {
      ...args,
      fields,
      candidates,
      title: page.title,
    });
    return null;
  },
});

export const refresh = workflow.define({
  args: { sourceId: v.id("sources"), run: v.number() },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const page = await step.runAction(internal.pipeline.scrape, {
      ...args,
      refresh: true,
    });
    const fields = await step.runAction(internal.pipeline.extract, {
      ...args,
      markdown: page.markdown,
      refresh: true,
    });
    await step.runMutation(internal.sources.finishRefresh, { ...args, fields });
    return null;
  },
});

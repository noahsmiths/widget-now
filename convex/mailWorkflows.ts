import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";

export const mailWorkflow = new WorkflowManager(components.mailWorkflow, {
  workpoolOptions: {
    maxParallelism: 2,
    retryActionsByDefault: true,
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
  },
});

export const deliver = mailWorkflow.define({
  args: { emailId: v.id("watchEmails") },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runAction(internal.agentmail.deliver, args);
    return null;
  },
});

export const reply = mailWorkflow.define({
  args: { replyId: v.id("watchReplies") },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const command = await step.runAction(internal.agentmail.readReply, args);
    if (command)
      await step.runMutation(internal.watchReplies.apply, { ...args, command });
    return null;
  },
});

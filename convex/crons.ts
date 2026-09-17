import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval(
  "Refresh due widget sources",
  { minutes: 1 },
  internal.sources.dispatchRefreshes,
  {},
);
export default crons;

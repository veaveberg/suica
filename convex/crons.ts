import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("refresh space availability", { minutes: 10 }, internal.spaceSync.syncAll, {});

export default crons;

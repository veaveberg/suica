import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { rateLimiter } from "./rateLimits";

/**
 * Internal mutation to enforce rate limits from HTTP actions,
 * which don't have a direct mutation context for the rate limiter.
 */
export const checkCalendarExportLimit = internalMutation({
    args: { key: v.string() },
    handler: async (ctx, args) => {
        await rateLimiter.limit(ctx, "calendarExport", {
            key: args.key,
            throws: true,
        });
    },
});

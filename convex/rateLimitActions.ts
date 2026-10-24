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

export const checkLoginLimit = internalMutation({
    args: { key: v.string() },
    handler: async (ctx, { key }) => {
        await rateLimiter.limit(ctx, "login", { key, throws: true });
    },
});

export const checkBackdoorLoginLimit = internalMutation({
    args: {},
    handler: async (ctx) => {
        // One budget for the endpoint. Changing the target ID cannot reset it.
        await rateLimiter.limit(ctx, "backdoorLogin", { key: "global", throws: true });
    },
});

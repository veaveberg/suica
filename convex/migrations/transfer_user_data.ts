import { v } from "convex/values";
import { mutation } from "../_generated/server";

export const transfer = mutation({
    args: {
        fromToken: v.string(),
        toToken: v.string(),
    },
    handler: async (ctx, args) => {
        // 1. Find the users just to verify they exist and log names
        const fromUser = await ctx.db
            .query("users")
            .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.fromToken))
            .first();

        const toUser = await ctx.db
            .query("users")
            .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.toToken))
            .first();

        if (!fromUser) console.warn(`Warning: Source user with token ${args.fromToken} not found in users table (but might have data).`);
        if (!toUser) console.warn(`Warning: Target user with token ${args.toToken} not found in users table.`);

        console.log(`Transferring data from token '${args.fromToken}' to '${args.toToken}'`);

        const tables = [
            "groups",
            "students",
            "student_groups",
            "subscriptions",
            "lessons",
            "schedules",
            "attendance",
            "tariffs",
            "passes",
            "pass_groups",
            "external_calendars",
        ];

        const results: Record<string, number> = {};

        for (const tableName of tables) {
            // @ts-ignore
            const records = await ctx.db
                .query(tableName as any)
                .withIndex("by_user", (q) => q.eq("userId", args.fromToken))
                .collect();

            results[tableName] = records.length;

            for (const record of records) {
                await ctx.db.patch(record._id, { userId: args.toToken });
            }
        }

        return {
            success: true,
            transferred: results,
            from: fromUser,
            to: toUser,
        };
    },
});

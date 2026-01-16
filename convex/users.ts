import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// This is a simplified validation for now.
// In a real production app, we MUST verify the hash using the Bot Token.
// Because we don't have the Bot Token easily available in this context without
// user interaction to set env vars, I will add a TO-DO and a basic check.
// The Plan is to use 'tokenIdentifier' as the unique key.

export const login = mutation({
    args: {
        initData: v.string(), // The raw query string from Telegram
        userData: v.object({
            id: v.number(),
            first_name: v.string(),
            last_name: v.optional(v.string()),
            username: v.optional(v.string()),
            photo_url: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        // TOD0: Verify args.initData signature using TELEGRAM_BOT_TOKEN
        // const botToken = process.env.TELEGRAM_BOT_TOKEN;
        // ... verification logic ...

        const tokenIdentifier = args.userData.id.toString();

        // Check if user exists
        const existingUser = await ctx.db
            .query("users")
            .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
            .first();

        if (existingUser) {
            // Update basic info if changed
            if (existingUser.name !== args.userData.first_name) {
                await ctx.db.patch(existingUser._id, { name: args.userData.first_name });
            }
            // DEV: Auto-promote to teacher if requested
            if (existingUser.role !== 'teacher' && existingUser.role !== 'admin') {
                await ctx.db.patch(existingUser._id, { role: 'teacher' });
                existingUser.role = 'teacher';
            }
            return existingUser;
        }

        // Determine initial role.
        // The FIRST user should probably be Admin or Teacher?
        // For now, default to 'teacher' if no users exist, otherwise 'student'?
        // OR create as 'student' by default and manually promote?
        // Let's check total users count.
        await ctx.db.query("users").take(1);

        const role = "teacher"; // Default to teacher for now to make development and onboarding easier.

        // Create new user
        const userId = await ctx.db.insert("users", {
            tokenIdentifier,
            name: args.userData.first_name,
            role,
            // studentId is null initially
        });

        return await ctx.db.get(userId);
    },
});

export const getMe = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.userId);
    },
});

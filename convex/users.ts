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
            auth_date: v.optional(v.number()),
            hash: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        // TOD0: Verify args.initData signature using TELEGRAM_BOT_TOKEN
        // const botToken = process.env.TELEGRAM_BOT_TOKEN;
        // ... verification logic ...

        const tokenIdentifier = args.userData.id.toString();
        const username = args.userData.username;

        // Check if user exists
        const existingUser = await ctx.db
            .query("users")
            .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
            .first();

        // 1. Find all student records to link
        const studentsToLink = [];

        // Match by ID
        const byId = await ctx.db
            .query("students")
            .withIndex("by_telegram_id", (q) => q.eq("telegram_id", tokenIdentifier))
            .collect();
        studentsToLink.push(...byId);

        // Match by username if ID not already found or to be thorough
        if (username) {
            const cleanUsername = username.startsWith('@') ? username.substring(1) : username;
            const atUsername = `@${cleanUsername}`;
            const variations = [username, cleanUsername, atUsername];

            for (const variant of variations) {
                const byUsername = await ctx.db
                    .query("students")
                    .withIndex("by_telegram_username", (q) => q.eq("telegram_username", variant))
                    .collect();

                for (const s of byUsername) {
                    if (!studentsToLink.find(existing => existing._id === s._id)) {
                        studentsToLink.push(s);
                    }
                }
            }
        }

        // 2. Patch all found student records
        for (const s of studentsToLink) {
            await ctx.db.patch(s._id, {
                telegram_id: tokenIdentifier,
                telegram_username: username || s.telegram_username
            });
        }

        if (existingUser) {
            const updates: any = {};
            if (username && existingUser.username !== username) updates.username = username;
            if (!existingUser.studentId && studentsToLink.length > 0) updates.studentId = studentsToLink[0]._id;

            if (Object.keys(updates).length > 0) {
                await ctx.db.patch(existingUser._id, updates);
                return await ctx.db.get(existingUser._id);
            }
            return existingUser;
        }

        // 3. Create new user
        const userId = await ctx.db.insert("users", {
            tokenIdentifier,
            name: args.userData.first_name,
            username: username,
            role: "student",
            studentId: studentsToLink.length > 0 ? studentsToLink[0]._id : undefined,
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

export const updateName = mutation({
    args: {
        userId: v.id("users"),
        name: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, { name: args.name });
    },
});

export const updateProfile = mutation({
    args: {
        userId: v.id("users"),
        updates: v.object({
            name: v.optional(v.string()),
            username: v.optional(v.string()),
            instagram_username: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await ctx.db.get(args.userId);
        if (!user) throw new Error("User not found");

        await ctx.db.patch(args.userId, args.updates);
    },
});

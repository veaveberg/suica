import { v } from "convex/values";
import { action, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { getUser } from "./permissions";
import { createSessionToken } from "./session";
import { authenticateTelegram } from "./telegramAuth";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

declare const process: { env: { [key: string]: string | undefined } };

function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

function createRandomToken(bytes = 32): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureCalendarExportTokenExists(ctx: MutationCtx, userId: Id<"users">) {
    const existing = await ctx.db
        .query("calendar_export_tokens")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
    if (existing) return;

    await ctx.db.insert("calendar_export_tokens", {
        userId,
        token: createRandomToken(),
        createdAt: new Date().toISOString(),
    });
}

const loginArgs = {
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
};

export const login = action({
    args: loginArgs,
    handler: async (ctx, args): Promise<Doc<"users"> & { sessionToken: string }> => {
        // Commit the attempt separately so a failed login cannot roll it back.
        await ctx.runMutation(internal.rateLimitActions.checkLoginLimit, { key: String(args.userData.id) });
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) throw new Error("Telegram auth is not configured");
        const verifiedUser = await authenticateTelegram(args.initData, args.userData, botToken);
        if (!verifiedUser) throw new Error("Invalid Telegram authentication");
        return await ctx.runMutation(internal.users.completeLogin, { userData: verifiedUser });
    },
});

export const completeLogin = internalMutation({
    args: { userData: loginArgs.userData },
    handler: async (ctx, { userData: verifiedUser }) => {
        const tokenIdentifier = verifiedUser.id.toString();
        const username = verifiedUser.username;

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
                    if ((!s.telegram_id || s.telegram_id === tokenIdentifier) && !studentsToLink.find(existing => existing._id === s._id)) {
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
            const updates: { username?: string; telegramUsernameVerified: boolean; studentId?: (typeof studentsToLink)[number]["_id"] } = { telegramUsernameVerified: true };
            if (existingUser.username !== username) updates.username = username;
            if (!existingUser.studentId && studentsToLink.length > 0) updates.studentId = studentsToLink[0]._id;

            let finalUser = existingUser;
            if (Object.keys(updates).length > 0) {
                await ctx.db.patch(existingUser._id, updates);
                const updated = await ctx.db.get(existingUser._id);
                if (updated) finalUser = updated;
            }
            await ensureCalendarExportTokenExists(ctx, finalUser._id);
            const sessionToken = await createSessionToken(finalUser._id, finalUser.role);
            return { ...finalUser, sessionToken };
        }

        // 3. Create new user
        const userId = await ctx.db.insert("users", {
            tokenIdentifier,
            name: verifiedUser.first_name,
            username: username,
            telegramUsernameVerified: true,
            role: "student",
            studentId: studentsToLink.length > 0 ? studentsToLink[0]._id : undefined,
        });

        const created = await ctx.db.get(userId);
        if (!created) throw new Error("Failed to create user");
        await ensureCalendarExportTokenExists(ctx, created._id);
        const sessionToken = await createSessionToken(created._id, created.role);
        return { ...created, sessionToken };
    },
});

export const backdoorLogin = action({
    args: {
        accessSecret: v.string(),
        targetTelegramId: v.number(),
    },
    handler: async (ctx, args): Promise<Doc<"users"> & { sessionToken: string }> => {
        if (process.env.ALLOW_BACKDOOR_LOGIN !== "true") {
            throw new Error("Backdoor login is disabled");
        }
        await ctx.runMutation(internal.rateLimitActions.checkBackdoorLoginLimit, {});
        const expectedSecret = process.env.BACKDOOR_LOGIN_SECRET;
        if (!expectedSecret || expectedSecret.length < 32) {
            throw new Error("Backdoor login requires a secret of at least 32 characters");
        }
        if (!safeEqual(args.accessSecret, expectedSecret)) throw new Error("Invalid backdoor credentials");
        return await ctx.runMutation(internal.users.completeBackdoorLogin, { targetTelegramId: args.targetTelegramId });
    },
});

export const completeBackdoorLogin = internalMutation({
    args: { targetTelegramId: v.number() },
    handler: async (ctx, args) => {
        const tokenIdentifier = String(args.targetTelegramId);
        const user = await ctx.db
            .query("users")
            .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
            .first();

        if (!user) {
            throw new Error("Target user not found");
        }

        console.warn(`[security] backdoorLogin used for telegramId=${tokenIdentifier}`);
        const sessionToken = await createSessionToken(user._id, user.role);
        return { ...user, sessionToken };
    },
});

export const getMe = query({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        return await getUser(ctx, args.userId, args.authToken);
    },
});

export const updateName = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        name: v.string(),
    },
    handler: async (ctx, args) => {
        await getUser(ctx, args.userId, args.authToken);
        await ctx.db.patch(args.userId, { name: args.name });
    },
});

export const updateProfile = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        updates: v.object({
            name: v.optional(v.string()),
            username: v.optional(v.string()),
            instagram_username: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await getUser(ctx, args.userId, args.authToken);
        const { username, ...profile } = args.updates;
        if (username !== undefined && username !== user.username) {
            throw new Error("Telegram username can only change through verified Telegram login");
        }
        await ctx.db.patch(args.userId, profile);
    },
});

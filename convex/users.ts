import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser } from "./permissions";
import { createSessionToken } from "./session";
import type { Id } from "./_generated/dataModel";

declare const process: { env: { [key: string]: string | undefined } };

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60; // 24h

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(digest);
}

async function hmacSha256Bytes(keyBytes: Uint8Array, payload: string): Promise<Uint8Array> {
    const rawKey = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer;
    const key = await crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    return new Uint8Array(signature);
}

function buildDataCheckString(entries: Array<[string, string]>): string {
    return entries
        .filter(([k, v]) => k !== "hash" && v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)] as [string, string])
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
}

function parseInitData(initData: string): Record<string, string> {
    const params = new URLSearchParams(initData);
    const out: Record<string, string> = {};
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
}

function getAuthDateFromParsed(parsed: Record<string, string>): number | null {
    const value = parsed.auth_date;
    if (!value) return null;
    const asNum = Number(value);
    return Number.isFinite(asNum) ? asNum : null;
}

function isAuthFresh(authDateSeconds: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return authDateSeconds > 0 && now - authDateSeconds <= MAX_AUTH_AGE_SECONDS;
}

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

async function ensureCalendarExportTokenExists(ctx: any, userId: Id<"users">) {
    const existing = await ctx.db
        .query("calendar_export_tokens")
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .first();
    if (existing) return;

    await ctx.db.insert("calendar_export_tokens", {
        userId,
        token: createRandomToken(),
        createdAt: new Date().toISOString(),
    });
}

async function verifyWebAppInitData(initData: string, botToken: string): Promise<boolean> {
    const parsed = parseInitData(initData);
    if (!parsed.hash) return false;

    const authDate = getAuthDateFromParsed(parsed);
    if (!authDate || !isAuthFresh(authDate)) return false;

    const dataCheckString = buildDataCheckString(Object.entries(parsed));
    const webAppKey = await hmacSha256Bytes(new TextEncoder().encode("WebAppData"), botToken);
    const expectedHash = toHex(await hmacSha256Bytes(webAppKey, dataCheckString));

    return expectedHash === parsed.hash;
}

function getWebAppUserId(initData: string): string | null {
    const parsed = parseInitData(initData);
    const rawUser = parsed.user;
    if (!rawUser) return null;
    try {
        const user = JSON.parse(rawUser);
        if (!user || typeof user.id !== "number") return null;
        return String(user.id);
    } catch {
        return null;
    }
}

async function verifyLoginWidgetData(
    userData: {
        id: number;
        first_name: string;
        last_name?: string;
        username?: string;
        photo_url?: string;
        auth_date?: number;
        hash?: string;
    },
    botToken: string
): Promise<boolean> {
    if (!userData.hash || !userData.auth_date) return false;
    if (!isAuthFresh(userData.auth_date)) return false;

    const entries: Array<[string, string]> = [
        ["id", String(userData.id)],
        ["first_name", userData.first_name],
    ];
    if (userData.last_name) entries.push(["last_name", userData.last_name]);
    if (userData.username) entries.push(["username", userData.username]);
    if (userData.photo_url) entries.push(["photo_url", userData.photo_url]);
    entries.push(["auth_date", String(userData.auth_date)]);

    const dataCheckString = buildDataCheckString(entries);
    const secretKey = await sha256Bytes(botToken);
    const expectedHash = toHex(await hmacSha256Bytes(secretKey, dataCheckString));

    return expectedHash === userData.hash;
}

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
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const allowInsecure = process.env.ALLOW_INSECURE_TELEGRAM_AUTH === "true";

        if (!botToken && !allowInsecure) {
            throw new Error("Telegram auth is not configured");
        }

        if (!allowInsecure) {
            let verified = false;

            if (botToken && args.initData && args.initData.includes("=")) {
                verified = await verifyWebAppInitData(args.initData, botToken);
                if (verified) {
                    const initDataUserId = getWebAppUserId(args.initData);
                    if (initDataUserId && initDataUserId !== String(args.userData.id)) {
                        verified = false;
                    }
                }
            }

            if (!verified && botToken) {
                verified = await verifyLoginWidgetData(args.userData, botToken);
            }

            if (!verified) {
                throw new Error("Invalid Telegram authentication");
            }
        }

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
            const updates: { username?: string; studentId?: (typeof studentsToLink)[number]["_id"] } = {};
            if (username && existingUser.username !== username) updates.username = username;
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
            name: args.userData.first_name,
            username: username,
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

export const backdoorLogin = mutation({
    args: {
        accessSecret: v.string(),
        targetTelegramId: v.number(),
    },
    handler: async (ctx, args) => {
        if (process.env.ALLOW_BACKDOOR_LOGIN !== "true") {
            throw new Error("Backdoor login is disabled");
        }
        const expectedSecret = process.env.BACKDOOR_LOGIN_SECRET;
        if (!expectedSecret) {
            throw new Error("Backdoor login is not configured");
        }
        if (!safeEqual(args.accessSecret, expectedSecret)) {
            throw new Error("Invalid backdoor credentials");
        }

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
        await getUser(ctx, args.userId, args.authToken);
        await ctx.db.patch(args.userId, args.updates);
    },
});

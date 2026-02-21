import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";
import type { Id, Doc } from "./_generated/dataModel";

declare const process: { env: { [key: string]: string | undefined } };

function createRandomToken(bytes = 32): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getExportToken(ctx: any, userId: Id<"users">) {
    return await ctx.db
        .query("calendar_export_tokens")
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .first();
}

async function ensureExportToken(ctx: any, userId: Id<"users">) {
    const existing = await getExportToken(ctx, userId);
    if (existing) return existing;
    const id = await ctx.db.insert("calendar_export_tokens", {
        userId,
        token: createRandomToken(),
        createdAt: new Date().toISOString(),
    });
    return await ctx.db.get(id);
}

export const get = query({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId, args.authToken);

        // Only teachers (and admins) have external calendars
        if (user.role === "admin") {
            return await ctx.db.query("external_calendars").collect();
        }

        return await ctx.db
            .query("external_calendars")
            .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
            .collect();
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        name: v.string(),
        url: v.string(),
        color: v.string(),
        enabled: v.boolean(),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId, args.authToken);

        return await ctx.db.insert("external_calendars", {
            name: args.name,
            url: args.url,
            color: args.color,
            enabled: args.enabled,
            userId: user.tokenIdentifier,
        });
    },
});

export const update = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        id: v.id("external_calendars"),
        updates: v.object({
            name: v.optional(v.string()),
            url: v.optional(v.string()),
            color: v.optional(v.string()),
            enabled: v.optional(v.boolean()),
            lastFetched: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
        const cal = await ctx.db.get(args.id);

        if (!cal) throw new Error("Calendar not found");
        if (cal.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.patch(args.id, args.updates);
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        id: v.id("external_calendars"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
        const cal = await ctx.db.get(args.id);

        if (!cal) throw new Error("Calendar not found");
        if (cal.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }


        await ctx.db.delete(args.id);
    },
});

// Returns the ICS export URL for the user
export const getExportUrl = query({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        await ensureTeacherOrStudent(ctx, args.userId, args.authToken);
        // Construct the URL. In Convex, we can use the configured site URL.
        const siteUrl = process.env.CONVEX_SITE_URL;
        if (!siteUrl) return null;
        const tokenDoc = await getExportToken(ctx, args.userId);
        if (!tokenDoc) return null;

        return `${siteUrl}/calendar?t=${encodeURIComponent(tokenDoc.token)}`;
    },
});

export const getGroupExportUrls = query({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId, args.authToken);
        const siteUrl = process.env.CONVEX_SITE_URL;
        if (!siteUrl) return [];
        const tokenDoc = await getExportToken(ctx, args.userId);
        if (!tokenDoc) return [];

        let groups: Doc<"groups">[] = [];

        if (user.role === "teacher") {
            groups = await ctx.db
                .query("groups")
                .withIndex("by_user", q => q.eq("userId", user.tokenIdentifier))
                .collect();
        } else {
            // Student
            const myStudentRecords = await ctx.db
                .query("students")
                .withIndex("by_telegram_id", (q) => q.eq("telegram_id", user.tokenIdentifier))
                .collect();

            const groupIds = new Set<Id<"groups">>();
            for (const s of myStudentRecords) {
                const sgs = await ctx.db.query("student_groups").withIndex("by_student_group", q => q.eq("student_id", s._id)).collect();
                sgs.forEach(sg => groupIds.add(sg.group_id));
            }

            for (const gid of groupIds) {
                const g = await ctx.db.get(gid);
                if (g) groups.push(g);
            }
        }

        return groups
            .filter(g => g.status === 'active')
            .map(g => ({
                id: g._id,
                name: g.name,
                color: g.color,
                url: `${siteUrl}/calendar?t=${encodeURIComponent(tokenDoc.token)}&groupId=${g._id}`
            }));
    }
});

export const rotateExportToken = mutation({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        await ensureTeacherOrStudent(ctx, args.userId, args.authToken);
        const current = await getExportToken(ctx, args.userId);
        if (current) {
            await ctx.db.patch(current._id, {
                token: createRandomToken(),
                createdAt: new Date().toISOString(),
            });
        } else {
            await ensureExportToken(ctx, args.userId);
        }
        return true;
    },
});

export const ensureExportTokenForUser = mutation({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        await ensureTeacherOrStudent(ctx, args.userId, args.authToken);
        await ensureExportToken(ctx, args.userId);
        return true;
    },
});

export const resolveUserIdByExportToken = internalQuery({
    args: { token: v.string() },
    handler: async (ctx, args) => {
        const tokenDoc = await ctx.db
            .query("calendar_export_tokens")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();
        if (!tokenDoc) return null;
        return tokenDoc.userId;
    },
});

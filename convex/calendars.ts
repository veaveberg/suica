import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent, getUser } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

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
        name: v.string(),
        url: v.string(),
        color: v.string(),
        enabled: v.boolean(),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

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
        const user = await ensureTeacher(ctx, args.userId);
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
        id: v.id("external_calendars"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const cal = await ctx.db.get(args.id);

        if (!cal) throw new Error("Calendar not found");
        if (cal.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.delete(args.id);
    },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

        if (user.role === "admin") {
            return await ctx.db.query("tariffs").collect();
        }

        if (user.role === "teacher") {
            return await ctx.db
                .query("tariffs")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
        }
        // Students don't typically see tariffs list, maybe?
        return [];
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        name: v.string(),
        type: v.string(),
        price: v.number(),
        count: v.number(),
        is_consecutive: v.boolean(),
        duration_days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        return await ctx.db.insert("tariffs", {
            name: args.name,
            type: args.type,
            price: args.price,
            count: args.count,
            is_consecutive: args.is_consecutive,
            duration_days: args.duration_days,
            userId: user.tokenIdentifier,
        });
    },
});

export const update = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("tariffs"),
        updates: v.object({
            name: v.optional(v.string()),
            type: v.optional(v.string()),
            price: v.optional(v.number()),
            count: v.optional(v.number()),
            is_consecutive: v.optional(v.boolean()),
            duration_days: v.optional(v.number()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const tariff = await ctx.db.get(args.id);

        if (!tariff) throw new Error("Tariff not found");
        if (tariff.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.patch(args.id, args.updates);
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("tariffs"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const tariff = await ctx.db.get(args.id);

        if (!tariff) throw new Error("Tariff not found");
        if (tariff.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.delete(args.id);
    },
});

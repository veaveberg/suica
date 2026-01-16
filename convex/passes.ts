import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent, getUser } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

        if (user.role === "admin") {
            return await ctx.db.query("passes").collect();
        }

        if (user.role === "teacher") {
            return await ctx.db
                .query("passes")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
        }

        return [];
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        name: v.string(),
        price: v.number(),
        lessons_count: v.number(),
        is_consecutive: v.boolean(),
        duration_days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        return await ctx.db.insert("passes", {
            name: args.name,
            price: args.price,
            lessons_count: args.lessons_count,
            is_consecutive: args.is_consecutive,
            duration_days: args.duration_days,
            userId: user.tokenIdentifier,
        });
    },
});

export const update = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("passes"),
        updates: v.object({
            name: v.optional(v.string()),
            price: v.optional(v.number()),
            lessons_count: v.optional(v.number()),
            is_consecutive: v.optional(v.boolean()),
            duration_days: v.optional(v.number()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const pass = await ctx.db.get(args.id);

        if (!pass) throw new Error("Pass not found");
        if (pass.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.patch(args.id, args.updates);
    },
});


export const remove = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("passes"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const pass = await ctx.db.get(args.id);

        if (!pass) throw new Error("Pass not found");
        if (pass.userId !== user.tokenIdentifier && user.role !== 'admin') throw new Error("Unauthorized");

        await ctx.db.delete(args.id);
    },
});

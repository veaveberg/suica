import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

        if (user.role === "admin") {
            return await ctx.db.query("subscriptions").collect();
        }

        if (user.role === "teacher") {
            return await ctx.db
                .query("subscriptions")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
        }

        if (user.role === "student" && user.studentId) {
            // Students see their own subscriptions
            return await ctx.db
                .query("subscriptions")
                .filter(q => q.eq(q.field("user_id"), user.studentId))
                .collect();
        }

        return [];
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        user_id: v.id("students"),
        group_id: v.id("groups"),
        tariff_id: v.optional(v.union(v.id("tariffs"), v.id("passes"))),
        type: v.string(),
        lessons_total: v.number(),
        price: v.number(),
        purchase_date: v.string(),
        expiry_date: v.optional(v.string()),
        is_consecutive: v.boolean(),
        duration_days: v.optional(v.number()),
        status: v.union(v.literal("active"), v.literal("archived")),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        return await ctx.db.insert("subscriptions", {
            user_id: args.user_id,
            group_id: args.group_id,
            tariff_id: args.tariff_id,
            type: args.type,
            lessons_total: args.lessons_total,
            price: args.price,
            purchase_date: args.purchase_date,
            expiry_date: args.expiry_date,
            is_consecutive: args.is_consecutive,
            duration_days: args.duration_days,
            status: args.status,
            userId: user.tokenIdentifier,
        });
    },
});

export const update = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("subscriptions"),
        updates: v.object({
            lessons_total: v.optional(v.number()),
            status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
            expiry_date: v.optional(v.string()),
            duration_days: v.optional(v.number()),
            price: v.optional(v.number()),
            purchase_date: v.optional(v.string()),
            is_consecutive: v.optional(v.boolean()),
            type: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const sub = await ctx.db.get(args.id);

        if (!sub) throw new Error("Subscription not found");
        if (sub.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.patch(args.id, args.updates);
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("subscriptions"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const sub = await ctx.db.get(args.id);

        if (!sub) throw new Error("Subscription not found");
        if (sub.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.delete(args.id);
    },
});

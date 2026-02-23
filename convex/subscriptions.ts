
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";
import { rateLimiter } from "./rateLimits";

export const get = query({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId, args.authToken);

        if (user.role === "admin") {
            return await ctx.db.query("subscriptions").collect();
        }

        const subscriptions = [];
        const seenIds = new Set<string>();

        // 1. If teacher, get owned subscriptions
        if (user.role === "teacher") {
            const owned = await ctx.db
                .query("subscriptions")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
            for (const s of owned) {
                if (!seenIds.has(s._id)) {
                    subscriptions.push(s);
                    seenIds.add(s._id);
                }
            }
        }

        // 2. Find all student records for this user (they might be students of multiple teachers)
        const myStudentRecords = await ctx.db
            .query("students")
            .withIndex("by_telegram_id", (q) => q.eq("telegram_id", user.tokenIdentifier))
            .collect();

        for (const studentRec of myStudentRecords) {
            const mySubs = await ctx.db
                .query("subscriptions")
                .filter(q => q.eq(q.field("user_id"), studentRec._id))
                .collect();
            for (const s of mySubs) {
                if (!seenIds.has(s._id)) {
                    subscriptions.push(s);
                    seenIds.add(s._id);
                }
            }
        }

        return subscriptions;
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
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
        await rateLimiter.limit(ctx, "mutate", { key: args.userId, throws: true });
        const user = await ensureTeacher(ctx, args.userId, args.authToken);

        const subId = await ctx.db.insert("subscriptions", {
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

        await ctx.scheduler.runAfter(0, internal.revenue.updateStudentRevenue, {
            studentId: args.user_id,
            groupId: args.group_id,
            teacherUserId: user.tokenIdentifier
        });

        return subId;
    },
});

export const update = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
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
        await rateLimiter.limit(ctx, "mutate", { key: args.userId, throws: true });
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
        const sub = await ctx.db.get(args.id);

        if (!sub) throw new Error("Subscription not found");
        if (sub.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.patch(args.id, args.updates);

        await ctx.scheduler.runAfter(0, internal.revenue.updateStudentRevenue, {
            studentId: sub.user_id,
            groupId: sub.group_id,
            teacherUserId: user.tokenIdentifier
        });
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        id: v.id("subscriptions"),
    },
    handler: async (ctx, args) => {
        await rateLimiter.limit(ctx, "mutate", { key: args.userId, throws: true });
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
        const sub = await ctx.db.get(args.id);

        if (!sub) throw new Error("Subscription not found");
        if (sub.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.delete(args.id);

        await ctx.scheduler.runAfter(0, internal.revenue.updateStudentRevenue, {
            studentId: sub.user_id,
            groupId: sub.group_id,
            teacherUserId: user.tokenIdentifier
        });
    },
});

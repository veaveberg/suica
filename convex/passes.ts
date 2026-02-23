import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";
import { rateLimiter } from "./rateLimits";

export const get = query({
    args: { userId: v.id("users"), authToken: v.string() },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId, args.authToken);

        if (user.role === "admin") {
            return await ctx.db.query("passes").collect();
        }

        const passes = [];
        const seenIds = new Set<string>();

        // 1. If teacher, get owned passes
        if (user.role === "teacher") {
            const owned = await ctx.db
                .query("passes")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
            for (const p of owned) {
                if (!seenIds.has(p._id)) {
                    passes.push(p);
                    seenIds.add(p._id);
                }
            }
        }

        // 2. Find all student records for this user (they might be students of multiple teachers)
        const myStudentRecords = await ctx.db
            .query("students")
            .withIndex("by_telegram_id", (q) => q.eq("telegram_id", user.tokenIdentifier))
            .collect();

        for (const studentRec of myStudentRecords) {
            // Get all passes from this teacher
            const teacherPasses = await ctx.db
                .query("passes")
                .withIndex("by_user", (q) => q.eq("userId", studentRec.userId))
                .collect();

            for (const p of teacherPasses) {
                if (!seenIds.has(p._id)) {
                    passes.push(p);
                    seenIds.add(p._id);
                }
            }
        }

        const passesWithTeacher = [];
        for (const p of passes) {
            const owner = await ctx.db
                .query("users")
                .withIndex("by_token", q => q.eq("tokenIdentifier", p.userId))
                .first();
            passesWithTeacher.push({
                ...p,
                teacherName: owner?.name || "Teacher",
                teacherUsername: owner?.username,
                teacherInstagram: owner?.instagram_username
            });
        }

        return passesWithTeacher;
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        name: v.string(),
        price: v.number(),
        lessons_count: v.number(),
        is_consecutive: v.boolean(),
        duration_days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await rateLimiter.limit(ctx, "mutate", { key: args.userId, throws: true });
        const user = await ensureTeacher(ctx, args.userId, args.authToken);

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
        authToken: v.string(),
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
        await rateLimiter.limit(ctx, "mutate", { key: args.userId, throws: true });
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
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
        authToken: v.string(),
        id: v.id("passes"),
    },
    handler: async (ctx, args) => {
        await rateLimiter.limit(ctx, "mutate", { key: args.userId, throws: true });
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
        const pass = await ctx.db.get(args.id);

        if (!pass) throw new Error("Pass not found");
        if (pass.userId !== user.tokenIdentifier && user.role !== 'admin') throw new Error("Unauthorized");

        await ctx.db.delete(args.id);
    },
});

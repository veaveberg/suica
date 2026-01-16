import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

        if (user.role === "admin") {
            return await ctx.db.query("lessons").collect();
        }

        if (user.role === "teacher") {
            return await ctx.db
                .query("lessons")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
        }

        if (user.role === "student" && user.studentId) {
            // Students see lessons for groups they are in.
            // First get student groups
            const studentGroups = await ctx.db
                .query("student_groups")
                .withIndex("by_student_group", (q) => q.eq("student_id", user.studentId!))
                .collect();
            const groupIds = studentGroups.map(sg => sg.group_id);

            // Fetch lessons for these groups
            // This is inefficient (N queries), but for MVP it works.
            // Optimization: Use `Promise.all` or `filter` on all lessons if data set is small.
            // For now, let's fetch all lessons and filter in memory since we lack "in" operator support in indexes well.
            // Actually, better to query by group if number of groups is small.
            const lessons = [];
            for (const gid of groupIds) {
                const groupLessons = await ctx.db
                    .query("lessons")
                    .withIndex("by_group_date", q => q.eq("group_id", gid))
                    .take(100); // Limit?
                lessons.push(...groupLessons);
            }
            return lessons;
        }

        return [];
    },
});

export const create = mutation({
    args: {
        userId: v.id("users"),
        group_id: v.id("groups"),
        date: v.string(),
        time: v.string(),
        duration_minutes: v.number(),
        status: v.union(v.literal("upcoming"), v.literal("cancelled"), v.literal("completed")),
        schedule_id: v.optional(v.id("schedules")),
        students_count: v.optional(v.number()), // Calculated?
        total_amount: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        return await ctx.db.insert("lessons", {
            group_id: args.group_id,
            date: args.date,
            time: args.time,
            duration_minutes: args.duration_minutes,
            status: args.status,
            schedule_id: args.schedule_id,
            students_count: args.students_count || 0,
            total_amount: args.total_amount || 0,
            userId: user.tokenIdentifier,
        });
    },
});

export const update = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("lessons"),
        updates: v.object({
            date: v.optional(v.string()),
            time: v.optional(v.string()),
            duration_minutes: v.optional(v.number()),
            status: v.optional(v.union(v.literal("upcoming"), v.literal("cancelled"), v.literal("completed"))),
            schedule_id: v.optional(v.id("schedules")),
            students_count: v.optional(v.number()),
            total_amount: v.optional(v.number()),
            notes: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const lesson = await ctx.db.get(args.id);

        if (!lesson) throw new Error("Lesson not found");
        if (lesson.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.patch(args.id, args.updates);
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("lessons"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const lesson = await ctx.db.get(args.id);

        if (!lesson) throw new Error("Lesson not found");
        if (lesson.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.delete(args.id);
    },
});

// Bulk Create for generation
export const bulkCreate = mutation({
    args: {
        userId: v.id("users"),
        lessons: v.array(v.object({
            group_id: v.id("groups"),
            date: v.string(),
            time: v.string(),
            duration_minutes: v.number(),
            status: v.union(v.literal("upcoming"), v.literal("cancelled"), v.literal("completed")),
            schedule_id: v.optional(v.id("schedules")),
            students_count: v.optional(v.number()),
            total_amount: v.optional(v.number()),
        }))
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        for (const lesson of args.lessons) {
            await ctx.db.insert("lessons", {
                ...lesson,
                userId: user.tokenIdentifier,
                students_count: lesson.students_count || 0,
                total_amount: lesson.total_amount || 0
            });
        }
    }
});

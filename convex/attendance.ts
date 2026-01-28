import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureTeacher, ensureTeacherOrStudent } from "./permissions";

export const get = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ensureTeacherOrStudent(ctx, args.userId);

        if (user.role === "admin") {
            return await ctx.db.query("attendance").collect();
        }

        if (user.role === "teacher") {
            return await ctx.db
                .query("attendance")
                .withIndex("by_user", (q) => q.eq("userId", user.tokenIdentifier))
                .collect();
        }

        if (user.role === "student" && user.studentId) {
            // Students see their own attendance
            // Inefficient without index, but ok for MVP
            return await ctx.db
                .query("attendance")
                .filter(q => q.eq(q.field("student_id"), user.studentId))
                .collect();
            // Or if we index by student_id
            /*
            return await ctx.db
                .query("attendance")
                .withIndex("by_lesson_student", q => q.eq("student_id", user.studentId)) // Wait, index is lesson_id+student_id
                // So we need an index on student_id. I didn't add it specifically.
                // Using filter for now.
                 .collect()
            */
        }

        return [];
    },
});

export const mark = mutation({
    args: {
        userId: v.id("users"),
        lesson_id: v.id("lessons"),
        student_id: v.id("students"),
        status: v.union(v.literal("present"), v.literal("absence_valid"), v.literal("absence_invalid")),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        // check if exists
        const existing = await ctx.db
            .query("attendance")
            .withIndex("by_lesson_student", q => q.eq("lesson_id", args.lesson_id).eq("student_id", args.student_id))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, { status: args.status });
        } else {
            await ctx.db.insert("attendance", {
                lesson_id: args.lesson_id,
                student_id: args.student_id,
                status: args.status,
                userId: user.tokenIdentifier,
            });
        }
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        id: v.id("attendance"),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);
        const record = await ctx.db.get(args.id);

        if (!record) throw new Error("Attendance record not found");
        if (record.userId !== user.tokenIdentifier && user.role !== 'admin') {
            throw new Error("Unauthorized");
        }

        await ctx.db.delete(args.id);
    },
});

export const bulkCreate = mutation({
    args: {
        userId: v.id("users"),
        attendance: v.array(v.object({
            lesson_id: v.id("lessons"),
            student_id: v.id("students"),
            status: v.union(v.literal("present"), v.literal("absence_valid"), v.literal("absence_invalid")),
        }))
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        for (const record of args.attendance) {
            // Check if exists
            const existing = await ctx.db
                .query("attendance")
                .withIndex("by_lesson_student", q => q.eq("lesson_id", record.lesson_id).eq("student_id", record.student_id))
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, { status: record.status });
            } else {
                await ctx.db.insert("attendance", {
                    ...record,
                    userId: user.tokenIdentifier,
                });
            }
        }
    }
});

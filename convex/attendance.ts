
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
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

        if (user.role === "student") {
            // Find all student records for this user (they might be students of multiple teachers)
            const myStudentRecords = await ctx.db
                .query("students")
                .withIndex("by_telegram_id", (q) => q.eq("telegram_id", user.tokenIdentifier))
                .collect();

            const attendance = [];
            for (const studentRec of myStudentRecords) {
                const records = await ctx.db
                    .query("attendance")
                    .filter(q => q.eq(q.field("student_id"), studentRec._id))
                    .collect();
                attendance.push(...records);
            }
            return attendance;
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
        payment_amount: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        // check if exists
        const existing = await ctx.db
            .query("attendance")
            .withIndex("by_lesson_student", q => q.eq("lesson_id", args.lesson_id).eq("student_id", args.student_id))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                status: args.status,
                payment_amount: args.payment_amount
            });
        } else {
            await ctx.db.insert("attendance", {
                lesson_id: args.lesson_id,
                student_id: args.student_id,
                status: args.status,
                payment_amount: args.payment_amount,
                userId: user.tokenIdentifier,
            });
        }

        // Trigger revenue recalculation
        const lesson = await ctx.db.get(args.lesson_id);
        if (lesson) {
            await ctx.scheduler.runAfter(0, internal.revenue.updateStudentRevenue, {
                studentId: args.student_id,
                groupId: lesson.group_id,
                teacherUserId: user.tokenIdentifier
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

        // Trigger recalculation
        const lesson = await ctx.db.get(record.lesson_id);
        if (lesson) {
            await ctx.scheduler.runAfter(0, internal.revenue.updateStudentRevenue, {
                studentId: record.student_id,
                groupId: lesson.group_id,
                teacherUserId: user.tokenIdentifier
            });
        }
    },
});

export const bulkCreate = mutation({
    args: {
        userId: v.id("users"),
        attendance: v.array(v.object({
            lesson_id: v.id("lessons"),
            student_id: v.id("students"),
            status: v.union(v.literal("present"), v.literal("absence_valid"), v.literal("absence_invalid")),
            payment_amount: v.optional(v.number()),
        }))
    },
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId);

        // Collect update targets (student/group pairs)
        const updates = new Map<string, { studentId: any, groupId: any }>();

        for (const record of args.attendance) {
            // Check if exists
            const existing = await ctx.db
                .query("attendance")
                .withIndex("by_lesson_student", q => q.eq("lesson_id", record.lesson_id).eq("student_id", record.student_id))
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, {
                    status: record.status,
                    payment_amount: record.payment_amount
                });
            } else {
                await ctx.db.insert("attendance", {
                    ...record,
                    userId: user.tokenIdentifier,
                });
            }

            // Prepare update trigger
            if (!updates.has(record.student_id)) {
                const lesson = await ctx.db.get(record.lesson_id);
                if (lesson) {
                    updates.set(record.student_id, { studentId: record.student_id, groupId: lesson.group_id });
                }
            }
        }

        for (const update of updates.values()) {
            await ctx.scheduler.runAfter(0, internal.revenue.updateStudentRevenue, {
                studentId: update.studentId,
                groupId: update.groupId,
                teacherUserId: user.tokenIdentifier
            });
        }
    }
});

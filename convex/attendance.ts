
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
        authToken: v.string(),
        lesson_id: v.id("lessons"),
        student_id: v.id("students"),
        status: v.union(v.literal("present"), v.literal("absence_valid"), v.literal("absence_invalid")),
        payment_amount: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await rateLimiter.limit(ctx, "mutate", { key: args.userId, throws: true });
        const user = await ensureTeacher(ctx, args.userId, args.authToken);

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
                teacherUserId: user.tokenIdentifier,
                triggerLessonId: args.lesson_id
            });
        }
    },
});

export const remove = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        id: v.id("attendance"),
    },
    handler: async (ctx, args) => {
        await rateLimiter.limit(ctx, "mutate", { key: args.userId, throws: true });
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
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
                teacherUserId: user.tokenIdentifier,
                triggerLessonId: record.lesson_id
            });
        }
    },
});

export const syncLessonAttendance = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        lesson_id: v.id("lessons"),
        attendance: v.array(v.object({
            student_id: v.id("students"),
            status: v.union(v.literal("present"), v.literal("absence_valid"), v.literal("absence_invalid")),
            payment_amount: v.optional(v.number()),
        }))
    },
    handler: async (ctx, args) => {
        await rateLimiter.limit(ctx, "bulkMutate", { key: args.userId, throws: true });
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
        const lesson = await ctx.db.get(args.lesson_id);
        if (!lesson) throw new Error("Lesson not found");

        const existingAttendance = await ctx.db
            .query("attendance")
            .withIndex("by_lesson_student", q => q.eq("lesson_id", args.lesson_id))
            .collect();

        const newAttendanceMap = new Map(args.attendance.map(a => [String(a.student_id), a]));
        const existingAttendanceMap = new Map(existingAttendance.map(a => [String(a.student_id), a]));

        const affectedStudents = new Set<string>();

        // 1. Delete or Update existing
        for (const existing of existingAttendance) {
            const studentIdStr = String(existing.student_id);
            const desired = newAttendanceMap.get(studentIdStr);

            if (!desired) {
                // Delete
                await ctx.db.delete(existing._id);
                affectedStudents.add(studentIdStr);
            } else {
                // Update if changed
                if (existing.status !== desired.status || existing.payment_amount !== desired.payment_amount) {
                    await ctx.db.patch(existing._id, {
                        status: desired.status,
                        payment_amount: desired.payment_amount
                    });
                    affectedStudents.add(studentIdStr);
                }
            }
        }

        // 2. Insert new
        for (const desired of args.attendance) {
            const studentIdStr = String(desired.student_id);
            if (!existingAttendanceMap.has(studentIdStr)) {
                await ctx.db.insert("attendance", {
                    ...desired,
                    lesson_id: args.lesson_id,
                    userId: user.tokenIdentifier,
                });
                affectedStudents.add(studentIdStr);
            }
        }

        // 3. Trigger revenue recalculations for students
        for (const studentId of affectedStudents) {
            await ctx.scheduler.runAfter(0, internal.revenue.updateStudentRevenue, {
                studentId: studentId as any,
                groupId: lesson.group_id,
                teacherUserId: user.tokenIdentifier,
                triggerLessonId: args.lesson_id
            });
        }
    }
});

export const syncLessonAttendanceOnly = syncLessonAttendance; // Alias if needed
// Bulk Create for migration/generation
export const bulkCreate = mutation({
    args: {
        userId: v.id("users"),
        authToken: v.string(),
        attendance: v.array(v.object({
            lesson_id: v.id("lessons"),
            student_id: v.id("students"),
            status: v.union(v.literal("present"), v.literal("absence_valid"), v.literal("absence_invalid")),
            payment_amount: v.optional(v.number()),
        }))
    },
    handler: async (ctx, args) => {
        await rateLimiter.limit(ctx, "bulkMutate", { key: args.userId, throws: true });
        const user = await ensureTeacher(ctx, args.userId, args.authToken);

        for (const record of args.attendance) {
            await ctx.db.insert("attendance", {
                ...record,
                userId: user.tokenIdentifier,
            });
        }
    }
});

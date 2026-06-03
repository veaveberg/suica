import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const renameCurrentAbsencesToLegacy = mutation({
    args: {},
    handler: async (ctx) => {
        const records = await ctx.db.query("attendance").collect();
        const renamed = {
            absence_valid: 0,
            absence_invalid: 0,
        };

        for (const record of records) {
            if (record.status === "absence_valid") {
                await ctx.db.patch(record._id, { status: "old_absence_valid" });
                renamed.absence_valid += 1;
            } else if (record.status === "absence_invalid") {
                await ctx.db.patch(record._id, { status: "old_absence_invalid" });
                renamed.absence_invalid += 1;
            }
        }

        return {
            success: true,
            renamed,
        };
    },
});

export const recalculateAttendanceById = mutation({
    args: {
        attendanceId: v.id("attendance"),
    },
    handler: async (ctx, args) => {
        const record = await ctx.db.get(args.attendanceId);
        if (!record) throw new Error("Attendance record not found");

        const lesson = await ctx.db.get(record.lesson_id);
        if (!lesson) throw new Error("Lesson not found");

        await ctx.scheduler.runAfter(0, internal.revenue.updateStudentRevenue, {
            studentId: record.student_id,
            groupId: lesson.group_id,
            teacherUserId: record.userId,
            triggerLessonId: record.lesson_id,
        });

        return {
            success: true,
            attendanceId: record._id,
            studentId: record.student_id,
            groupId: lesson.group_id,
            lessonId: record.lesson_id,
        };
    },
});

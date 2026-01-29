
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { calculateStudentGroupBalanceWithAudit } from "./balance_logic";

export const updateStudentRevenue = internalMutation({
    args: {
        studentId: v.id("students"),
        groupId: v.id("groups"),
        teacherUserId: v.string(),
        triggerLessonId: v.optional(v.id("lessons")),
    },
    handler: async (ctx, args) => {
        // Fetch inputs required for audit
        const subscriptions = await ctx.db
            .query("subscriptions")
            .withIndex("by_user", q => q.eq("userId", args.teacherUserId))
            .collect();
        // Note: Optimally we should filter by student/group here, but the existing index is by_user (teacher)
        // Filtering in memory afterwards. Or use a specific index if available.
        // Actually, we need subscriptions for this student and group.
        // Let's filter in memory.

        const studentSubscriptions = subscriptions.filter(s =>
            s.user_id === args.studentId && s.group_id === args.groupId
        );

        const attendance = await ctx.db
            .query("attendance")
            .withIndex("by_user", q => q.eq("userId", args.teacherUserId))
            .filter(q => q.eq(q.field("student_id"), args.studentId))
            .collect();

        // Need lessons for attendance
        // We can fetch all lessons for the group
        // Or fetch specific lessons. Since we need to sort them chronologically, fetching group lessons is best.
        // Optimization: only fetch lessons >= student creation? 
        // For now, simpler to fetch all group lessons.
        const lessons = await ctx.db
            .query("lessons")
            .withIndex("by_group_date", q => q.eq("group_id", args.groupId))
            .collect();

        // Run Audit
        const auditResult = calculateStudentGroupBalanceWithAudit(
            args.studentId,
            args.groupId,
            studentSubscriptions,
            attendance,
            lessons
        );

        // Process audit entries to update revenue
        const touchedLessonIds = new Set<string>();

        for (const entry of auditResult.auditEntries) {
            // Find the attendance record
            const record = attendance.find(a => a.lesson_id === entry.lessonId);
            if (!record) continue;

            let cost = 0;
            let isUncovered = false;

            if (entry.status === 'counted') {
                if (entry.coveredByPassId) {
                    const pass = studentSubscriptions.find(s => s._id === entry.coveredByPassId);
                    if (pass && pass.lessons_total > 0) {
                        cost = pass.price / pass.lessons_total;
                    }
                } else {
                    isUncovered = true;
                }
            }

            // Only update if changed
            if (record.payment_amount !== cost || record.is_uncovered !== isUncovered) {
                await ctx.db.patch(record._id, {
                    payment_amount: cost,
                    is_uncovered: isUncovered
                });
                touchedLessonIds.add(entry.lessonId);
            }
        }

        // If a specific lesson triggered this, ensure it's in the list even if no local changes were made
        // (This happens when attendance for this student was deleted)
        if (args.triggerLessonId) {
            touchedLessonIds.add(args.triggerLessonId);
        }

        // Recalculate totals for touched lessons
        for (const lessonId of touchedLessonIds) {
            const lessonAttendance = await ctx.db
                .query("attendance")
                .withIndex("by_lesson_student", q => q.eq("lesson_id", lessonId as any))
                .collect();

            const totalAmount = lessonAttendance.reduce((sum, a) => sum + (a.payment_amount || 0), 0);
            const uncoveredCount = lessonAttendance.filter(a => a.is_uncovered).length;

            await ctx.db.patch(lessonId as any, {
                total_amount: totalAmount,
                uncovered_count: uncoveredCount
            });
        }
    }
});

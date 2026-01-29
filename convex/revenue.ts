
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { calculateStudentGroupBalanceWithAudit } from "./balance_logic";
import { calculateRevenuePerLesson } from "./revenue_logic";

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

        // Pre-calculate revenue values for all lessons
        const revenueMap = calculateRevenuePerLesson(
            args.studentId,
            args.groupId,
            studentSubscriptions,
            lessons,
            attendance
        );

        // Process audit entries to update revenue
        const touchedLessonIds = new Set<string>();

        for (const entry of auditResult.auditEntries) {
            // Find the attendance record
            const record = attendance.find(a => a.lesson_id === entry.lessonId);
            if (!record) continue;

            const revenueInfo = revenueMap.get(entry.lessonId);

            let cost = 0;
            let isUncovered = false;

            if (entry.status === 'counted') {
                if (entry.coveredByPassId && revenueInfo) {
                    cost = revenueInfo.cost;
                } else if (!entry.coveredByPassId) {
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

export const getRevenueStatsForLesson = query({
    args: {
        lessonId: v.id("lessons"),
        groupId: v.id("groups"),
        // We pass groupId to avoid fetching lesson first if possible, but lessonId is needed.
        // Actually we can look up lesson to get group. But passing both is fine/safer if we have it.
        // Let's just take lessonId to be clean.
    },
    handler: async (ctx, args) => {
        // We actually need groupId.
        // If we only have lessonId, we fetch lesson.
        // But the UI probably has groupId.
        // Let's support just lessonId for now.
        const lesson = await ctx.db.get(args.lessonId);
        if (!lesson) return {};

        const groupId = lesson.group_id;

        // 1. Get all students in this group (active or relevant)
        // We can find students via 'student_groups'
        const studentGroups = await ctx.db
            .query("student_groups")
            .withIndex("by_user", q => q.eq("userId", lesson.userId))
            .filter(q => q.eq(q.field("group_id"), groupId))
            .collect();

        const studentIds = studentGroups.map(sg => sg.student_id);
        if (studentIds.length === 0) return {};

        // 2. Fetch all subscriptions for these students in this group
        // Optimization: Fetch all subs for group?
        // Schema: subscriptions.index("by_user") -> Teacher.
        // We don't have "by_group" index on subscriptions?
        // Let's check schema.
        // subscriptions has "by_user" (userId=Teacher).
        // It doesn't have "by_group".
        // So we fetch by Teacher (owner) and filter?
        // Or we use "by_user" index?
        // We need the teacher's User ID.
        // Lesson has userId.

        const subscriptions = await ctx.db
            .query("subscriptions")
            .withIndex("by_user", q => q.eq("userId", lesson.userId))
            .collect(); // This might be large if teacher has many groups.

        // Filter for this group
        const groupSubscriptions = subscriptions.filter(s => s.group_id === groupId);

        // 3. Fetch all lessons for group
        const lessons = await ctx.db
            .query("lessons")
            .withIndex("by_group_date", q => q.eq("group_id", groupId))
            .collect();

        // 3b. Fetch all attendance for group (by teacher)
        const groupAttendance = await ctx.db
            .query("attendance")
            .withIndex("by_user", q => q.eq("userId", lesson.userId))
            .collect()
            .then(all => all.filter(a => studentIds.includes(a.student_id))); // Filter by relevant students

        // 4. Calculate for each student
        const results: Record<string, { cost: number, equation: string, isEstimated: boolean }> = {};

        for (const studentId of studentIds) {
            // 4b. Fetch attendance for this student (Optimize: fetch once above?)
            // We need ALL attendance for this student in this group.
            // Let's fetch all attendance for the teacher (userId) and filter in memory? 
            // We should do this OUTSIDE the loop.
            const studentSubs = groupSubscriptions.filter(s => s.user_id === studentId);

            // Note: We need to pass attendance.
            // Let's fetch relevant attendance outside loop.

            const studentAttendance = groupAttendance.filter(a => a.student_id === studentId);

            // We pass ALL group lessons to the calc
            const map = calculateRevenuePerLesson(studentId, groupId, studentSubs, lessons, studentAttendance);

            const info = map.get(lesson._id);
            if (info) {
                results[studentId] = {
                    cost: info.cost,
                    equation: info.equation,
                    isEstimated: info.isEstimated
                };
            }
        }

        return results;
    }
});

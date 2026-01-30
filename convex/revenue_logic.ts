
import type { Doc } from "./_generated/dataModel";

export interface LessonRevenueInfo {
    cost: number;
    equation: string;
    usedPassId?: string;
    isEstimated: boolean;
}

export function calculateRevenuePerLesson(
    studentId: string,
    groupId: string,
    subscriptions: Doc<"subscriptions">[],
    lessons: Doc<"lessons">[],
    attendance: Doc<"attendance">[]
): Map<string, LessonRevenueInfo> {
    const revenueMap = new Map<string, LessonRevenueInfo>();
    const today = new Date().toISOString().split('T')[0];

    // 1. Filter and Sort Passes
    const passes = subscriptions
        .filter(s => s.user_id === studentId && s.group_id === groupId)
        .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));

    // 2. Filter and Sort Lessons
    const sortedLessons = lessons
        .filter(l => l.group_id === groupId)
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    // Build attendance map for fast lookup
    const attendanceMap = new Map<string, Doc<"attendance">>();
    for (const a of attendance) {
        if (a.student_id === studentId) {
            attendanceMap.set(a.lesson_id, a);
        }
    }

    // Track state for pass usage during traversal
    const passCapacity = new Map<string, number>();
    for (const p of passes) {
        passCapacity.set(p._id, p.lessons_total);
    }

    // Helper to check if pass is expired relative to TODAY
    const isExpiredRelativeToday = (p: Doc<"subscriptions">) =>
        p.status === 'archived' || (p.expiry_date && p.expiry_date < today);

    // 3. Process Non-Consecutive Windows (already defined by date ranges)
    const passEffectiveWindows = new Map<string, { start: string, end: string, pass: Doc<"subscriptions"> }>();
    const nonConsecutivePasses = passes.filter(p => !p.is_consecutive);

    for (let i = 0; i < nonConsecutivePasses.length; i++) {
        const pass = nonConsecutivePasses[i];
        const start = pass.purchase_date;
        let end = pass.expiry_date || "9999-12-31";

        if (i < nonConsecutivePasses.length - 1) {
            const nextPass = nonConsecutivePasses[i + 1];
            if (nextPass.purchase_date < end) {
                end = nextPass.purchase_date;
            }
        }
        passEffectiveWindows.set(pass._id, { start, end, pass });
    }

    // Pre-calculate usage stats for non-consecutive passes
    const passUsageStats = new Map<string, { attended: number, unattended: number }>();

    for (const lesson of sortedLessons) {
        if (lesson.status === 'cancelled') continue;

        for (const [passId, window] of passEffectiveWindows.entries()) {
            if (lesson.date >= window.start && lesson.date < window.end) {
                // Check relative today expiration
                if (isExpiredRelativeToday(window.pass) && lesson.date >= today) continue;

                // Also check capacity if we want to be strict, but non-consecutive are window-based.
                // However, they still have lessons_total!
                const remaining = passCapacity.get(passId) || 0;
                if (remaining <= 0) continue;

                const stats = passUsageStats.get(passId) || { attended: 0, unattended: 0 };
                const attendanceRecord = attendanceMap.get(lesson._id);
                const isAttended = attendanceRecord?.status === 'present';
                const isValidSkip = attendanceRecord?.status === 'absence_valid';

                if (!isValidSkip) {
                    if (isAttended) stats.attended++;
                    else stats.unattended++;
                    passCapacity.set(passId, remaining - 1);
                }
                passUsageStats.set(passId, stats);
                break; // One pass per lesson
            }
        }
    }

    // Reset capacity for the main calculation loop (we will traverse again to assign revenue)
    for (const p of passes) {
        passCapacity.set(p._id, p.lessons_total);
    }

    // 4. Calculate Revenue
    for (const lesson of sortedLessons) {
        if (lesson.status === 'cancelled') continue;

        let coveredBy = null;

        // A. Check Non-Consecutive Windows
        for (const [, window] of passEffectiveWindows.entries()) {
            if (lesson.date >= window.start && lesson.date < window.end) {
                if (isExpiredRelativeToday(window.pass) && lesson.date >= today) continue;

                const remaining = passCapacity.get(window.pass._id) || 0;
                if (remaining > 0) {
                    coveredBy = window.pass;
                    break;
                }
            }
        }

        // B. Check Consecutive
        if (!coveredBy) {
            const candidatePasses = passes.filter(p => p.is_consecutive &&
                lesson.date >= p.purchase_date &&
                (!p.expiry_date || lesson.date <= p.expiry_date) &&
                (!isExpiredRelativeToday(p) || lesson.date < today));

            for (const p of candidatePasses) {
                const remaining = passCapacity.get(p._id) || 0;
                if (remaining > 0) {
                    coveredBy = p;
                    break;
                }
            }
        }

        if (coveredBy) {
            let cost = 0;
            let equation = "";

            const attendanceRecord = attendanceMap.get(lesson._id);
            const isAttended = attendanceRecord?.status === 'present';
            const isValidSkip = attendanceRecord?.status === 'absence_valid';

            if (isValidSkip) {
                cost = 0;
                equation = "0 (Valid Skip)";
                // Valid skip doesn't consume capacity in our logic
            } else {
                if (!coveredBy.is_consecutive) {
                    // Non-Consecutive (Hybrid)
                    const stats = passUsageStats.get(coveredBy._id) || { attended: 0, unattended: 1 };
                    const fixedRate = coveredBy.price / (coveredBy.lessons_total || 1);

                    if (isAttended) {
                        cost = fixedRate;
                        equation = `${coveredBy.price} / ${coveredBy.lessons_total}`;
                    } else {
                        const revenueUsed = stats.attended * fixedRate;
                        const remainingRevenue = Math.max(0, coveredBy.price - revenueUsed);
                        const count = stats.unattended || 1;
                        cost = remainingRevenue / count;
                        equation = `(${coveredBy.price} - ${revenueUsed.toFixed(0)}) / ${count}`;
                    }
                } else {
                    // Consecutive
                    const count = coveredBy.lessons_total || 1;
                    cost = coveredBy.price / count;
                    equation = `${coveredBy.price} / ${count}`;
                }

                // Consume capacity
                const remaining = passCapacity.get(coveredBy._id) || 0;
                passCapacity.set(coveredBy._id, remaining - 1);
            }

            revenueMap.set(lesson._id, {
                cost,
                equation,
                usedPassId: coveredBy._id,
                isEstimated: lesson.date > new Date().toISOString()
            });
        }
    }

    return revenueMap;
}

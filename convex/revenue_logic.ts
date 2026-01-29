
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

    // 1. Filter and Sort Passes
    // We only care about active passes for this group/student
    // Note: 'archived' passes might still be relevant for historical lessons, so we include all.
    const passes = subscriptions
        .filter(s => s.user_id === studentId && s.group_id === groupId)
        .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));

    // 2. Filter and Sort Lessons
    const sortedLessons = lessons
        .filter(l => l.group_id === groupId)
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    // 3. Process Passes to define timelines
    // For Consecutive passes, the timeline is [PurchaseDate, NextPassPurchaseDate OR ExpiryDate)
    // For Non-Consecutive, it is [PurchaseDate, ExpiryDate) but usage is Credit-based.

    // We need to map each lesson to a pass *first* to count the total lessons for consecutive passes.

    // Strategy:
    // A. Identify the "Effective Window" for each Consecutive pass.
    // B. Count lessons in that window.
    // C. Calculate cost.

    const passEffectiveWindows = new Map<string, { start: string, end: string, pass: Doc<"subscriptions"> }>();

    for (let i = 0; i < passes.length; i++) {
        const pass = passes[i];
        if (pass.is_consecutive) continue; // CONSECUTIVE uses fixed calc, so no window needed (or simple usage)


        const start = pass.purchase_date;
        let end = pass.expiry_date || "9999-12-31";

        // Check for overlap with NEXT consecutive or ANY next pass?
        // User said: "if later they get another pass... we then have to only count lessons from the start of the pass to getting a new pass"
        // This usually implies the new pass replaces the old one.
        // Assuming ANY new pass (of same group) acts as a cut-off.

        if (i < passes.length - 1) {
            const nextPass = passes[i + 1];
            if (nextPass.purchase_date < end) {
                end = nextPass.purchase_date;
            }
        }

        passEffectiveWindows.set(pass._id, { start, end, pass });
    }

    // 4. Calculate Revenue
    // For Consecutive: Divide Price by Lesson Count in Window.
    // For Non-Consecutive: Divide Price by Total Lessons (Limit).

    // Build attendance map for fast lookup
    const attendanceMap = new Map<string, Doc<"attendance">>();
    for (const a of attendance) {
        if (a.student_id === studentId) {
            attendanceMap.set(a.lesson_id, a);
        }
    }

    // Pre-calculate counts for passes (Attended vs Unattended in window)
    const passUsageStats = new Map<string, { attended: number, unattended: number }>();

    for (const lesson of sortedLessons) {
        if (lesson.status === 'cancelled') continue; // Don't count cancelled

        // Check which pass covers this (for stats)
        for (const [passId, window] of passEffectiveWindows.entries()) {
            if (lesson.date >= window.start && lesson.date < window.end) {
                const stats = passUsageStats.get(passId) || { attended: 0, unattended: 0 };

                // User Logic:
                // Attended (Present) -> Fixed Rate.
                // Unattended (Invalid Skip, Future, Unmarked) -> Dynamic Remainder.
                // Valid Skip -> Extends pass (Ignored here to not dilute value?)

                const attendanceRecord = attendanceMap.get(lesson._id);
                // Status defaults to 'unmarked' if not found.
                // But lesson might be 'future'.

                const isAttended = attendanceRecord?.status === 'present';
                const isValidSkip = attendanceRecord?.status === 'absence_valid';

                if (!isValidSkip) {
                    if (isAttended) {
                        stats.attended++;
                    } else {
                        stats.unattended++;
                    }
                }
                passUsageStats.set(passId, stats);
            }
        }
    }

    // Now assign revenue
    // We iterate lessons again to assign values
    // We need to know if a lesson is ACTUALLY covered by a specific pass (logic from balance_logic might be needed?)
    // Or do we implement standalone coverage logic here?
    // "Either attendance is marked or not, we can show revenue".
    // This implies we project coverage.

    // Let's iterate lessons and determine best-guess coverage.

    for (const lesson of sortedLessons) {
        if (lesson.status === 'cancelled') continue;

        // Find applicable pass
        let coveredBy = null;

        // 1. Check Non-Consecutive Windows first (Dynamic / Date Limited)
        for (const [, window] of passEffectiveWindows.entries()) {
            if (lesson.date >= window.start && lesson.date < window.end) {
                coveredBy = window.pass;
                break;
            }
        }

        // 2. If not covered by dynamic, check Consecutive (Fixed / Credit based)
        if (!coveredBy) {
            const fixedPasses = passes.filter(p => p.is_consecutive &&
                lesson.date >= p.purchase_date &&
                (!p.expiry_date || lesson.date <= p.expiry_date));

            if (fixedPasses.length > 0) {
                coveredBy = fixedPasses[0];
            }
        }

        if (coveredBy) {
            let cost = 0;
            let equation = "";

            if (!coveredBy.is_consecutive) {
                // Non-Consecutive (Hybrid Logic)
                const stats = passUsageStats.get(coveredBy._id) || { attended: 0, unattended: 1 };

                // 1. Fixed Rate for Attended
                const fixedRate = coveredBy.price / (coveredBy.lessons_total || 1);

                const attendanceRecord = attendanceMap.get(lesson._id);
                const isAttended = attendanceRecord?.status === 'present';
                const isValidSkip = attendanceRecord?.status === 'absence_valid';

                if (isAttended) {
                    cost = fixedRate;
                    equation = `${coveredBy.price} / ${coveredBy.lessons_total}`;
                } else {
                    // 2. Dynamic Rate for Unattended (Remainder)
                    const revenueUsed = stats.attended * fixedRate;
                    const remainingRevenue = coveredBy.price - revenueUsed;
                    // Distribute remainder among unattended lessons
                    // If no unattended lessons (shouldn't happen if we are here and status != present), default to fixed?
                    // Or if we are a valid skip?

                    if (isValidSkip) {
                        cost = 0;
                        equation = "0 (Valid Skip)";
                    } else {
                        const count = stats.unattended || 1;
                        cost = remainingRevenue / count;
                        // Format: "(Price - Used) / RemainingCount"
                        // e.g. "(100 - 20) / 4"
                        equation = `(${coveredBy.price} - ${revenueUsed.toFixed(0)}) / ${count}`;
                    }
                }
            } else {
                // Consecutive (In a row): Fixed price per lesson (Limit)
                // Note: Previous logic was Fixed. Stick to Fixed.
                const count = coveredBy.lessons_total || 1;
                cost = coveredBy.price / count;
                equation = `${coveredBy.price} / ${count}`;
            }

            revenueMap.set(lesson._id, {
                cost,
                equation,
                usedPassId: coveredBy._id,
                isEstimated: lesson.date > new Date().toISOString() // Proxy for "future"
            });
        }
    }

    return revenueMap;
}

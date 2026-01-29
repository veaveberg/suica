
import { Doc } from "./_generated/dataModel";

export interface StudentBalance {
    balance: number;
    lessonsOwed: number;
    lessonsCovered: number;
    uncoveredLessons: { lessonId: string; date: string; groupId: string }[];
}

export type AuditReason =
    | 'counted_present'
    | 'counted_absence_invalid'
    | 'not_counted_valid_skip'
    | 'not_counted_no_attendance'
    | 'not_counted_cancelled'
    | 'uncovered_pass_depleted'
    | 'uncovered_no_matching_pass';

export interface BalanceAuditEntry {
    lessonId: string;
    lessonDate: string;
    lessonTime: string;
    attendanceStatus: "present" | "absence_valid" | "absence_invalid" | null;
    status: 'counted' | 'not_counted';
    reason: AuditReason;
    coveredByPassId?: string;
}

export interface PassUsage {
    passId: string;
    lessonsUsed: number;
    lessonsTotal: number;
    purchaseDate: string;
    expiryDate?: string;
}

export interface BalanceAuditResult extends StudentBalance {
    auditEntries: BalanceAuditEntry[];
    passUsage: PassUsage[];
}

/**
 * Calculates student balance for a specific group WITH detailed audit information.
 * - Lessons within pass validity consume pass credits (shown as covered)
 * - Lessons with no pass create debt (shown as uncovered)
 * - Lessons outside pass validity don't count (not shown - they don't affect balance)
 */
export function calculateStudentGroupBalanceWithAudit(
    studentId: string,
    groupId: string,
    subscriptions: Doc<"subscriptions">[],
    attendance: Doc<"attendance">[],
    lessons: Doc<"lessons">[]
): BalanceAuditResult {
    const spendingStatuses = ['present', 'absence_invalid'];
    const auditEntries: BalanceAuditEntry[] = [];

    // Get all passes for this student+group
    const studentPasses = subscriptions.filter(s =>
        s.user_id === studentId &&
        s.group_id === groupId &&
        (s.status === 'active' || !s.status)
    );

    // Get all lessons for this group
    const groupLessons = lessons.filter(l => l.group_id === groupId);

    // Get all attendance records for this student in this group
    const studentAttendance = attendance.filter(a => {
        if (a.student_id !== studentId) return false;
        const lesson = lessons.find(l => l._id === a.lesson_id);
        return lesson && lesson.group_id === groupId;
    });

    // Build attendance lookup map
    const attendanceByLesson = new Map<string, Doc<"attendance">>();
    for (const a of studentAttendance) {
        attendanceByLesson.set(a.lesson_id, a);
    }

    // Filter lessons that have attendance marked and sort by date
    const lessonsWithAttendance = groupLessons
        .filter(l => attendanceByLesson.has(l._id))
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    // Handle case: NO PASSES - all spending lessons = debt
    if (studentPasses.length === 0) {
        let lessonsOwed = 0;
        const uncoveredLessons: { lessonId: string; date: string; groupId: string }[] = [];

        for (const lesson of lessonsWithAttendance) {
            const attendanceRecord = attendanceByLesson.get(lesson._id)!;

            // Skip cancelled/valid skip
            if (lesson.status === 'cancelled') {
                auditEntries.push({
                    lessonId: lesson._id,
                    lessonDate: lesson.date,
                    lessonTime: lesson.time,
                    attendanceStatus: attendanceRecord.status,
                    status: 'not_counted',
                    reason: 'not_counted_cancelled'
                });
                continue;
            }
            if (attendanceRecord.status === 'absence_valid') {
                auditEntries.push({
                    lessonId: lesson._id,
                    lessonDate: lesson.date,
                    lessonTime: lesson.time,
                    attendanceStatus: attendanceRecord.status,
                    status: 'not_counted',
                    reason: 'not_counted_valid_skip'
                });
                continue;
            }

            // Spending status with no pass = debt
            if (spendingStatuses.includes(attendanceRecord.status)) {
                lessonsOwed++;
                uncoveredLessons.push({
                    lessonId: lesson._id,
                    date: lesson.date,
                    groupId: lesson.group_id
                });
                auditEntries.push({
                    lessonId: lesson._id,
                    lessonDate: lesson.date,
                    lessonTime: lesson.time,
                    attendanceStatus: attendanceRecord.status,
                    status: 'counted',
                    reason: 'uncovered_no_matching_pass'
                });
            }
        }

        return {
            balance: -lessonsOwed, // Negative = debt
            lessonsOwed,
            lessonsCovered: 0,
            uncoveredLessons,
            auditEntries,
            passUsage: []
        };
    }

    // HAS PASSES - process with pass coverage logic
    const sortedPasses = [...studentPasses].sort((a, b) =>
        a.purchase_date.localeCompare(b.purchase_date)
    );

    // Track remaining capacity per pass and usage
    const passCapacity = new Map<string, number>();
    const passUsageMap = new Map<string, number>();
    for (const pass of sortedPasses) {
        passCapacity.set(pass._id, pass.lessons_total);
        passUsageMap.set(pass._id, 0);
    }

    let lessonsCovered = 0;

    for (const lesson of lessonsWithAttendance) {
        const attendanceRecord = attendanceByLesson.get(lesson._id)!;

        // Handle cancelled lessons
        if (lesson.status === 'cancelled') {
            auditEntries.push({
                lessonId: lesson._id,
                lessonDate: lesson.date,
                lessonTime: lesson.time,
                attendanceStatus: attendanceRecord.status,
                status: 'not_counted',
                reason: 'not_counted_cancelled'
            });
            continue;
        }

        // Handle valid skips
        if (attendanceRecord.status === 'absence_valid') {
            auditEntries.push({
                lessonId: lesson._id,
                lessonDate: lesson.date,
                lessonTime: lesson.time,
                attendanceStatus: attendanceRecord.status,
                status: 'not_counted',
                reason: 'not_counted_valid_skip'
            });
            continue;
        }

        // Spending status - try to find a pass
        if (spendingStatuses.includes(attendanceRecord.status)) {
            const isPresent = attendanceRecord.status === 'present';
            const isInvalidSkip = attendanceRecord.status === 'absence_invalid';

            let covered = false;
            let candidatePassId: string | undefined = undefined;
            let dateMatchesConsecutivePass = false;

            for (const pass of sortedPasses) {
                const afterStart = lesson.date >= pass.purchase_date;
                const beforeExpiry = !pass.expiry_date || lesson.date <= pass.expiry_date;

                if (afterStart && beforeExpiry) {
                    // This pass covers the date range
                    candidatePassId = pass._id;
                    if (pass.is_consecutive) dateMatchesConsecutivePass = true;

                    // IF it's an invalid skip, it ONLY consumes credits if the pass is consecutive
                    if (isInvalidSkip && !pass.is_consecutive) {
                        continue;
                    }

                    const remaining = passCapacity.get(pass._id)! || 0;
                    if (remaining > 0) {
                        passCapacity.set(pass._id, remaining - 1);
                        passUsageMap.set(pass._id, (passUsageMap.get(pass._id) || 0) + 1);
                        lessonsCovered++;
                        covered = true;

                        auditEntries.push({
                            lessonId: lesson._id,
                            lessonDate: lesson.date,
                            lessonTime: lesson.time,
                            attendanceStatus: attendanceRecord.status,
                            status: 'counted',
                            reason: isPresent ? 'counted_present' : 'counted_absence_invalid',
                            coveredByPassId: pass._id
                        });
                        break;
                    }
                }
            }

            // Allocation logic for uncovered lessons
            if (!covered) {
                const shouldCountAsDebt = isPresent || dateMatchesConsecutivePass || (!candidatePassId && isInvalidSkip);

                if (shouldCountAsDebt) {
                    auditEntries.push({
                        lessonId: lesson._id,
                        lessonDate: lesson.date,
                        lessonTime: lesson.time,
                        attendanceStatus: attendanceRecord.status,
                        status: 'counted',
                        reason: candidatePassId ? 'uncovered_pass_depleted' : 'uncovered_no_matching_pass'
                    });
                } else {
                    auditEntries.push({
                        lessonId: lesson._id,
                        lessonDate: lesson.date,
                        lessonTime: lesson.time,
                        attendanceStatus: attendanceRecord.status,
                        status: 'not_counted',
                        reason: 'not_counted_no_attendance'
                    });
                }
            }
        }
    }

    const totalOwedCount = auditEntries.filter(e => e.status === 'counted').length;
    const totalCapacity = studentPasses.reduce((sum, p) => sum + p.lessons_total, 0);

    const allStudentPasses = subscriptions.filter(s =>
        s.user_id === studentId &&
        s.group_id === groupId
    ).sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));

    const passUsage: PassUsage[] = allStudentPasses.map(pass => ({
        passId: pass._id,
        lessonsUsed: passUsageMap.get(pass._id) || 0,
        lessonsTotal: pass.lessons_total,
        purchaseDate: pass.purchase_date,
        expiryDate: pass.expiry_date
    }));

    return {
        balance: totalCapacity - totalOwedCount,
        lessonsOwed: totalOwedCount,
        lessonsCovered,
        uncoveredLessons: auditEntries
            .filter(e => e.status === 'counted' && !e.coveredByPassId)
            .map(e => ({ lessonId: e.lessonId, date: e.lessonDate, groupId })),
        auditEntries,
        passUsage
    };
}

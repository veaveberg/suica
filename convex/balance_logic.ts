
import type { Doc } from "./_generated/dataModel";

export interface StudentBalance {
    balance: number;
    lessonsOwed: number;
    lessonsCovered: number;
    uncoveredLessons: { lessonId: string; date: string; groupId: string }[];
}

export type AuditReason =
    | 'counted_present'
    | 'counted_absence_invalid'
    | 'counted_no_attendance_consecutive'
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
    const auditEntries: BalanceAuditEntry[] = [];

    const today = new Date().toISOString().split('T')[0];
    // Get all passes for this student+group
    const studentPasses = subscriptions.filter(s =>
        s.user_id === studentId &&
        s.group_id === groupId
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

    // Sort all group lessons for deterministic pass allocation
    const sortedGroupLessons = [...groupLessons]
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    // Keep this subset for the no-pass branch, which still depends on explicit attendance marks
    const lessonsWithAttendance = sortedGroupLessons
        .filter(l => attendanceByLesson.has(l._id));

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
            if (attendanceRecord.status === 'present') {
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
            } else if (attendanceRecord.status === 'absence_invalid') {
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
    const passCoversDate = (pass: Doc<"subscriptions">, lessonDate: string): boolean => {
        const afterStart = lessonDate >= pass.purchase_date;
        const beforeExpiry = !pass.expiry_date || lessonDate <= pass.expiry_date;
        if (!afterStart || !beforeExpiry) return false;
        // Only use archived/expired-by-today passes for past lessons
        if (pass.status === 'archived' && lessonDate >= today) return false;
        if (pass.expiry_date && pass.expiry_date < today && lessonDate >= today) return false;
        return true;
    };
    const hasConsecutivePassForDate = (lessonDate: string): boolean =>
        sortedPasses.some(pass => pass.is_consecutive && passCoversDate(pass, lessonDate));

    // Track remaining capacity per pass and usage
    const passCapacity = new Map<string, number>();
    const passUsageMap = new Map<string, number>();
    for (const pass of sortedPasses) {
        passCapacity.set(pass._id, pass.lessons_total);
        passUsageMap.set(pass._id, 0);
    }

    let lessonsCovered = 0;

    for (const lesson of sortedGroupLessons) {
        const attendanceRecord = attendanceByLesson.get(lesson._id);
        const autoConsumeConsecutive =
            !attendanceRecord &&
            lesson.date < today &&
            hasConsecutivePassForDate(lesson.date);

        // Ignore lessons without explicit attendance unless they should auto-consume a consecutive pass
        if (!attendanceRecord && !autoConsumeConsecutive) {
            continue;
        }

        // Handle cancelled lessons
        if (lesson.status === 'cancelled') {
            auditEntries.push({
                lessonId: lesson._id,
                lessonDate: lesson.date,
                lessonTime: lesson.time,
                attendanceStatus: attendanceRecord?.status ?? null,
                status: 'not_counted',
                reason: 'not_counted_cancelled'
            });
            continue;
        }

        // Handle valid skips
        if (attendanceRecord?.status === 'absence_valid') {
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

        const isPresent = autoConsumeConsecutive || attendanceRecord?.status === 'present';
        const isInvalidSkip = attendanceRecord?.status === 'absence_invalid';
        const isSpendingLesson = isPresent || isInvalidSkip;
        const auditAttendanceStatus = attendanceRecord?.status ?? null;

        // Spending status - try to find a pass
        if (isSpendingLesson) {
            let covered = false;
            let candidatePassId: string | undefined = undefined;
            let dateMatchesConsecutivePass = false;

            for (const pass of sortedPasses) {
                if (passCoversDate(pass, lesson.date)) {

                    // This pass covers the date range
                    candidatePassId = pass._id;
                    if (pass.is_consecutive) dateMatchesConsecutivePass = true;

                    // Auto-consumed lessons only apply for consecutive passes
                    if (autoConsumeConsecutive && !pass.is_consecutive) {
                        continue;
                    }

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
                            attendanceStatus: auditAttendanceStatus,
                            status: 'counted',
                            reason: autoConsumeConsecutive
                                ? 'counted_no_attendance_consecutive'
                                : (isPresent ? 'counted_present' : 'counted_absence_invalid'),
                            coveredByPassId: pass._id
                        });
                        break;
                    }
                }
            }

            // Allocation logic for uncovered lessons
            if (!covered) {
                const shouldCountAsDebt = isPresent || dateMatchesConsecutivePass;

                if (shouldCountAsDebt) {
                    auditEntries.push({
                        lessonId: lesson._id,
                        lessonDate: lesson.date,
                        lessonTime: lesson.time,
                        attendanceStatus: auditAttendanceStatus,
                        status: 'counted',
                        reason: candidatePassId ? 'uncovered_pass_depleted' : 'uncovered_no_matching_pass'
                    });
                } else {
                    auditEntries.push({
                        lessonId: lesson._id,
                        lessonDate: lesson.date,
                        lessonTime: lesson.time,
                        attendanceStatus: auditAttendanceStatus,
                        status: 'not_counted',
                        reason: 'not_counted_no_attendance'
                    });
                }
            }
        }
    }

    const totalOwedCount = auditEntries.filter(e => e.status === 'counted').length;
    // Total capacity only includes passes that were actually used OR are still active
    const totalCapacity = studentPasses
        .filter(p => (p.status === 'active' || !p.status) || (passUsageMap.get(p._id) || 0) > 0)
        .reduce((sum, p) => sum + p.lessons_total, 0);

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

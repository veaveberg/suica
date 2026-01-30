import * as api from '../api';
import type { Attendance, Subscription, Lesson, AttendanceStatus } from '../types';

export interface StudentBalance {
    balance: number;  // positive = surplus, negative = debt
    lessonsOwed: number;
    lessonsCovered: number;
    uncoveredLessons: { lessonId: string; date: string; groupId: string }[];
}

export type AuditReason =
    | 'counted_present'           // Attended, counted against pass
    | 'counted_absence_invalid'   // Invalid skip, counted against pass
    | 'not_counted_valid_skip'    // Valid skip, not counted
    | 'not_counted_no_attendance' // No attendance record (lesson exists but not marked)
    | 'not_counted_cancelled'     // Lesson was cancelled
    | 'uncovered_pass_depleted'   // Counted but pass ran out of capacity
    | 'uncovered_no_matching_pass'; // Counted but no pass covers that date

export interface BalanceAuditEntry {
    lessonId: string;
    lessonDate: string;
    lessonTime: string;
    attendanceStatus: AttendanceStatus | null;
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
 * Calculates student balance for a specific group.
 * Delegates to the audit function for a single source of truth.
 */
export function calculateStudentGroupBalance(
    studentId: string,
    groupId: string,
    subscriptions: Subscription[],
    attendance: Attendance[],
    lessons: Lesson[]
): StudentBalance {
    const auditResult = calculateStudentGroupBalanceWithAudit(
        studentId, groupId, subscriptions, attendance, lessons
    );

    return {
        balance: auditResult.balance,
        lessonsOwed: auditResult.lessonsOwed,
        lessonsCovered: auditResult.lessonsCovered,
        uncoveredLessons: auditResult.uncoveredLessons
    };
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
    subscriptions: Subscription[],
    attendance: Attendance[],
    lessons: Lesson[]
): BalanceAuditResult {
    const spendingStatuses = ['present', 'absence_invalid'];
    const auditEntries: BalanceAuditEntry[] = [];

    const today = new Date().toISOString().split('T')[0];
    // Get all passes for this student+group
    const studentPasses = subscriptions.filter(s =>
        String(s.user_id) === String(studentId) &&
        String(s.group_id) === String(groupId)
    );

    // Get all lessons for this group
    const groupLessons = lessons.filter(l => String(l.group_id) === String(groupId));

    // Get all attendance records for this student in this group
    const studentAttendance = attendance.filter(a => {
        if (String(a.student_id) !== String(studentId)) return false;
        const lesson = lessons.find(l => String(l.id) === String(a.lesson_id));
        return lesson && String(lesson.group_id) === String(groupId);
    });

    // Build attendance lookup map
    const attendanceByLesson = new Map<string, Attendance>();
    for (const a of studentAttendance) {
        attendanceByLesson.set(String(a.lesson_id), a);
    }

    // Filter lessons that have attendance marked and sort by date
    const lessonsWithAttendance = groupLessons
        .filter(l => attendanceByLesson.has(String(l.id)))
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    // Handle case: NO PASSES - all spending lessons = debt
    if (studentPasses.length === 0) {
        let lessonsOwed = 0;
        const uncoveredLessons: { lessonId: string; date: string; groupId: string }[] = [];

        for (const lesson of lessonsWithAttendance) {
            const attendanceRecord = attendanceByLesson.get(String(lesson.id))!;

            // Skip cancelled/valid skip
            if (lesson.status === 'cancelled') {
                auditEntries.push({
                    lessonId: String(lesson.id),
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
                    lessonId: String(lesson.id),
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
                    lessonId: String(lesson.id),
                    date: lesson.date,
                    groupId: String(lesson.group_id)
                });
                auditEntries.push({
                    lessonId: String(lesson.id),
                    lessonDate: lesson.date,
                    lessonTime: lesson.time,
                    attendanceStatus: attendanceRecord.status,
                    status: 'counted',
                    reason: 'uncovered_no_matching_pass'
                });
            } else if (attendanceRecord.status === 'absence_invalid') {
                auditEntries.push({
                    lessonId: String(lesson.id),
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

    // Track remaining capacity per pass and usage
    const passCapacity = new Map<string, number>();
    const passUsageMap = new Map<string, number>();
    for (const pass of sortedPasses) {
        passCapacity.set(pass.id!, pass.lessons_total);
        passUsageMap.set(pass.id!, 0);
    }

    let lessonsCovered = 0;

    for (const lesson of lessonsWithAttendance) {
        const attendanceRecord = attendanceByLesson.get(String(lesson.id))!;

        // Handle cancelled lessons
        if (lesson.status === 'cancelled') {
            auditEntries.push({
                lessonId: String(lesson.id),
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
                lessonId: String(lesson.id),
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
                    // Only use archived passes for past lessons
                    if (pass.status === 'archived' && lesson.date >= today) continue;
                    // Also check if expired by date relative to today
                    if (pass.expiry_date && pass.expiry_date < today && lesson.date >= today) continue;

                    // This pass covers the date range
                    candidatePassId = pass.id;
                    if (pass.is_consecutive) dateMatchesConsecutivePass = true;

                    // IF it's an invalid skip, it ONLY consumes credits if the pass is consecutive
                    if (isInvalidSkip && !pass.is_consecutive) {
                        continue;
                    }

                    const remaining = passCapacity.get(pass.id!) || 0;
                    if (remaining > 0) {
                        passCapacity.set(pass.id!, remaining - 1);
                        passUsageMap.set(pass.id!, (passUsageMap.get(pass.id!) || 0) + 1);
                        lessonsCovered++;
                        covered = true;

                        auditEntries.push({
                            lessonId: String(lesson.id),
                            lessonDate: lesson.date,
                            lessonTime: lesson.time,
                            attendanceStatus: attendanceRecord.status,
                            status: 'counted',
                            reason: isPresent ? 'counted_present' : 'counted_absence_invalid',
                            coveredByPassId: pass.id!
                        });
                        break;
                    }
                }
            }

            // Allocation logic for uncovered lessons:
            // 1. 'present' always counts as debt if not covered
            // 2. 'absence_invalid' counts as debt if:
            //    - It fell within a consecutive pass window (pass exists but depleted), OR
            //    - No pass exists at all (student skipped without any pass)
            if (!covered) {
                const shouldCountAsDebt = isPresent || dateMatchesConsecutivePass;

                if (shouldCountAsDebt) {
                    auditEntries.push({
                        lessonId: String(lesson.id),
                        lessonDate: lesson.date,
                        lessonTime: lesson.time,
                        attendanceStatus: attendanceRecord.status,
                        status: 'counted',
                        // If a pass matched the date but had no capacity: 'uncovered_pass_depleted'
                        // If no pass matched the date at all: 'uncovered_no_matching_pass'
                        reason: candidatePassId ? 'uncovered_pass_depleted' : 'uncovered_no_matching_pass'
                    });
                } else {
                    // Flexible pass + skip = 0 effect (skip doesn't consume slot)
                    auditEntries.push({
                        lessonId: String(lesson.id),
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

    // Total capacity only includes passes that were actually used OR are still active
    const totalCapacity = studentPasses
        .filter(p => (p.status === 'active' || !p.status) || (passUsageMap.get(p.id!) || 0) > 0)
        .reduce((sum, p) => sum + (p.lessons_total || 0), 0);

    // Build pass usage summary - include ALL passes (including archived) for audit transparency
    const allStudentPasses = subscriptions.filter(s =>
        String(s.user_id) === String(studentId) &&
        String(s.group_id) === String(groupId)
    ).sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));

    const passUsage: PassUsage[] = allStudentPasses.map(pass => ({
        passId: pass.id!,
        lessonsUsed: passUsageMap.get(pass.id!) || 0,
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

/**
 * Calculates total student balance across all groups.
 */
export function calculateStudentBalance(
    studentId: string,
    subscriptions: Subscription[],
    attendance: Attendance[],
    lessons: Lesson[]
): { surplus: number; debt: number; uncoveredLessons: { lessonId: string; date: string; groupId: string }[] } {
    // Get all unique groups this student has passes for or attendance in
    const groupIds = new Set<string>();

    subscriptions
        .filter(s => String(s.user_id) === String(studentId))
        .forEach(s => groupIds.add(String(s.group_id)));

    attendance
        .filter(a => String(a.student_id) === String(studentId))
        .forEach(a => {
            const lesson = lessons.find(l => String(l.id) === String(a.lesson_id));
            if (lesson) groupIds.add(String(lesson.group_id));
        });

    let totalSurplus = 0;
    let totalDebt = 0;
    const allUncovered: { lessonId: string; date: string; groupId: string }[] = [];

    for (const groupId of groupIds) {
        const groupBalance = calculateStudentGroupBalance(studentId, groupId, subscriptions, attendance, lessons);
        if (groupBalance.balance > 0) {
            totalSurplus += groupBalance.balance;
        } else {
            totalDebt += Math.abs(groupBalance.balance);
        }
        allUncovered.push(...groupBalance.uncoveredLessons);
    }

    return { surplus: totalSurplus, debt: totalDebt, uncoveredLessons: allUncovered };
}

/**
 * Checks all active subscriptions and archives those that have expired.
 */
export async function checkAndArchiveExpired(subscriptions: Subscription[]): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const expired = subscriptions.filter(s =>
        (s.status === 'active' || !s.status) &&
        s.expiry_date &&
        s.expiry_date < today
    );

    if (expired.length === 0) return false;

    for (const sub of expired) {
        await api.update('subscriptions', sub.id!, { status: 'archived' });
    }
    return true;
}

import type { Attendance, Lesson, Subscription } from '../types';

export interface ConsecutiveSubscriptionExpiration {
    expirationDate?: string;
    missingLessons: number;
}

/**
 * Calculates the last included lesson date for a consecutive subscription.
 * Cancelled lessons and valid absences do not consume a slot.
 */
export function getConsecutiveSubscriptionExpiration(
    subscription: Subscription,
    lessons: Lesson[],
    attendance: Attendance[]
): ConsecutiveSubscriptionExpiration {
    const relevantLessons = lessons
        .filter(lesson =>
            String(lesson.group_id) === String(subscription.group_id) &&
            lesson.date >= subscription.purchase_date &&
            lesson.status !== 'cancelled'
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    const attendanceByLessonId = new Map<string, Attendance>();
    for (const record of attendance) {
        if (String(record.student_id) !== String(subscription.user_id)) continue;
        attendanceByLessonId.set(String(record.lesson_id), record);
    }

    let countedLessons = 0;

    for (const lesson of relevantLessons) {
        const lessonAttendance = lesson.id
            ? attendanceByLessonId.get(String(lesson.id))
            : undefined;

        if (lessonAttendance?.status === 'absence_valid') {
            continue;
        }

        countedLessons += 1;
        if (countedLessons >= subscription.lessons_total) {
            return {
                expirationDate: lesson.date,
                missingLessons: 0
            };
        }
    }

    return {
        missingLessons: Math.max(subscription.lessons_total - countedLessons, 0)
    };
}

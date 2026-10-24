// Lesson times are school-local wall times, currently Asia/Tbilisi (UTC+4).
export function attendanceReminderDue(lesson: { date: string; time: string; duration_minutes: number; status: string }, now: number) {
    const due = lessonReminderTime(lesson);
    return lesson.status !== 'cancelled' && Number.isFinite(due) && now >= due && now < due + 24 * 60 * 60_000;
}

export function attendanceUrl(appUrl: string, lessonId: string) {
    const url = new URL(appUrl);
    if (url.protocol !== 'https:') throw new Error('SUICA_APP_URL must use HTTPS');
    url.searchParams.set('tab', 'classes');
    url.searchParams.set('lessonId', lessonId);
    return url.href;
}

export function lessonReminderTime(lesson: { date: string; time: string; duration_minutes: number }) {
    return Date.parse(`${lesson.date}T${lesson.time}:00+04:00`) + (lesson.duration_minutes + 60) * 60_000;
}

export function reminderScheduleTime(lesson: { date: string; time: string; duration_minutes: number; status: string }, now: number): number | undefined {
    const due = lessonReminderTime(lesson);
    return lesson.status !== 'cancelled' && Number.isFinite(due) && now < due + 24 * 60 * 60_000 ? due : undefined;
}

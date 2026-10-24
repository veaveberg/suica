import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceReminderDue, attendanceUrl } from '../convex/notificationLogic.ts';
const lesson = { date: '2026-10-14', time: '23:30', duration_minutes: 90, status: 'upcoming' };
const due = Date.parse('2026-10-15T02:00:00+04:00');
test('reminder waits until one hour after the full lesson, across midnight', () => {
    assert.equal(attendanceReminderDue(lesson, due - 1), false);
    assert.equal(attendanceReminderDue(lesson, due), true);
    assert.equal(attendanceReminderDue({ ...lesson, status: 'completed' }, due), true);
    assert.equal(attendanceReminderDue({ ...lesson, status: 'cancelled' }, due), false);
    assert.equal(attendanceReminderDue(lesson, due + 86400_000), false);
    assert.equal(attendanceReminderDue({ ...lesson, date: 'invalid' }, due), false);
});
test('button preserves hosting path and targets the existing attendance screen', () => {
    const url = new URL(attendanceUrl('https://example.com/suica/?tab=calendar', 'lesson123'));
    assert.equal(url.pathname, '/suica/');
    assert.equal(url.searchParams.get('tab'), 'classes');
    assert.equal(url.searchParams.get('lessonId'), 'lesson123');
    assert.throws(() => attendanceUrl('http://example.com', 'lesson123'));
});

test('future lessons get one due time; cancelled and stale lessons do not', async () => {
    const { reminderScheduleTime, lessonReminderTime } = await import('../convex/notificationLogic.ts');
    assert.equal(lessonReminderTime(lesson), due);
    assert.equal(reminderScheduleTime(lesson, due - 86400_000), due);
    assert.equal(reminderScheduleTime(lesson, due + 10_000), due);
    assert.equal(reminderScheduleTime(lesson, due + 86400_000), undefined);
    assert.equal(reminderScheduleTime({ ...lesson, status: 'cancelled' }, due - 1000), undefined);
    assert.equal(reminderScheduleTime({ ...lesson, duration_minutes: 30 }, due - 86400_000), due - 3600_000);
});

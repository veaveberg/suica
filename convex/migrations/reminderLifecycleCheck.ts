import { internalMutation } from '../_generated/server';
import { createScheduledLesson, updateScheduledLesson, deleteScheduledLesson, syncLessonReminder } from '../lessonReminders';
import { DEVELOPER_TELEGRAM_ID } from '../botLanguage';

// Runs entirely in one transaction: the temporary lesson is deleted before commit.
// All jobs are canceled, so no teacher message can be sent by this check.
export const run = internalMutation({
    args: {},
    handler: async ctx => {
        const reference = await ctx.db.query('lessons').first();
        if (!reference) return { skipped: true };
        const testDate = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
        const id = await createScheduledLesson(ctx, {
            group_id: reference.group_id, userId: DEVELOPER_TELEGRAM_ID,
            date: testDate, time: '19:00', duration_minutes: 60,
            status: 'upcoming', students_count: 0, total_amount: 0,
        });
        const first = await ctx.db.get(id);
        if (!first?.reminderJobId) throw new Error('Reminder was not scheduled');
        const firstJob = await ctx.db.system.get(first.reminderJobId);
        if (firstJob?.state.kind !== 'pending' || firstJob.scheduledTime !== Date.parse(`${testDate}T21:00:00+04:00`)) throw new Error('Wrong reminder time');
        if (await syncLessonReminder(ctx, first)) throw new Error('Unchanged sync replaced the reminder');
        await updateScheduledLesson(ctx, id, { time: '20:00' });
        const moved = await ctx.db.get(id);
        const cancelledJob = await ctx.db.system.get(first.reminderJobId);
        if (!moved?.reminderJobId || moved.reminderJobId === first.reminderJobId || cancelledJob?.state.kind !== 'canceled') throw new Error('Reschedule did not replace the job');
        const movedJob = await ctx.db.system.get(moved.reminderJobId);
        if (movedJob?.scheduledTime !== Date.parse(`${testDate}T22:00:00+04:00`)) throw new Error('Rescheduled time incorrect');
        await updateScheduledLesson(ctx, id, { status: 'cancelled' });
        const cancelled = await ctx.db.get(id);
        if (cancelled?.reminderJobId || (await ctx.db.system.get(moved.reminderJobId))?.state.kind !== 'canceled') throw new Error('Lesson cancellation did not cancel reminder');
        await updateScheduledLesson(ctx, id, { status: 'upcoming' });
        const restored = await ctx.db.get(id);
        if (!restored?.reminderJobId) throw new Error('Reactivation did not schedule reminder');
        await deleteScheduledLesson(ctx, restored);
        if (await ctx.db.get(id) || (await ctx.db.system.get(restored.reminderJobId))?.state.kind !== 'canceled') throw new Error('Deletion did not cancel reminder');
        return { passed: true, created: true, unchangedReused: true, rescheduled: true, cancellation: true, reactivation: true, deletion: true };
    },
});

import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { reminderScheduleTime } from './notificationLogic';

type LessonInput = Omit<Doc<'lessons'>, '_id' | '_creationTime'>;

export async function cancelLessonReminder(ctx: MutationCtx, lesson: Doc<'lessons'>) {
    if (!lesson.reminderJobId) return;
    const job = await ctx.db.system.get(lesson.reminderJobId);
    if (job && (job.state.kind === 'pending' || job.state.kind === 'inProgress')) await ctx.scheduler.cancel(job._id);
}

export async function syncLessonReminder(ctx: MutationCtx, lesson: Doc<'lessons'>): Promise<boolean> {
    const dueAt = reminderScheduleTime(lesson, Date.now());
    if (dueAt === lesson.reminderDueAt && (dueAt === undefined || lesson.reminderJobId)) return false;
    await cancelLessonReminder(ctx, lesson);
    const reminderJobId = dueAt === undefined ? undefined : await ctx.scheduler.runAt(Math.max(Date.now(), dueAt), internal.notifications.deliverLesson, { lessonId: lesson._id, dueAt });
    await ctx.db.patch(lesson._id, { reminderDueAt: dueAt, reminderJobId });
    return true;
}

export async function createScheduledLesson(ctx: MutationCtx, lesson: LessonInput): Promise<Id<'lessons'>> {
    const id = await ctx.db.insert('lessons', lesson);
    const created = await ctx.db.get(id);
    if (created) await syncLessonReminder(ctx, created);
    return id;
}

export async function updateScheduledLesson(ctx: MutationCtx, id: Id<'lessons'>, updates: Partial<LessonInput>) {
    await ctx.db.patch(id, updates);
    const lesson = await ctx.db.get(id);
    if (lesson) await syncLessonReminder(ctx, lesson);
}

export async function deleteScheduledLesson(ctx: MutationCtx, lesson: Doc<'lessons'>) {
    await cancelLessonReminder(ctx, lesson);
    await ctx.db.delete(lesson._id);
}

import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { attendanceReminderDue, attendanceUrl, lessonReminderTime } from './notificationLogic';

import { syncLessonReminder } from './lessonReminders';

import { attendanceMessage, DEVELOPER_TELEGRAM_ID } from './botLanguage';

declare const process: { env: Record<string, string | undefined> };

export const claim = internalMutation({
    args: { lessonId: v.id('lessons'), dueAt: v.number() },
    handler: async (ctx, { lessonId, dueAt }) => {
        const lesson = await ctx.db.get(lessonId);
        const now = Date.now();
        if (!lesson || lesson.reminderDueAt !== dueAt || lessonReminderTime(lesson) !== dueAt || !attendanceReminderDue(lesson, now)) return null;
        const previous = await ctx.db.query('teacher_notifications').withIndex('by_lesson', q => q.eq('lessonId', lessonId)).first();
        const sameSchedule = previous && (previous.dueAt === undefined || previous.dueAt === dueAt);
        if (sameSchedule && (previous.status !== 'failed' || previous.attempts >= 3 || now - previous.attemptedAt < 5 * 60_000)) return null;
        const teacher = await ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', lesson.userId)).first();
        const group = await ctx.db.get(lesson.group_id);
        if (!teacher || teacher.role === 'student' || !/^\d+$/.test(teacher.tokenIdentifier) || !group || group.status !== 'active') return null;
        const memberships = await ctx.db.query('student_groups').withIndex('by_user', q => q.eq('userId', lesson.userId)).collect();
        const marks = await ctx.db.query('attendance').withIndex('by_lesson_student', q => q.eq('lesson_id', lessonId)).collect();
        const marked = new Set(marks.map(mark => mark.student_id));
        let missing = 0;
        for (const membership of memberships.filter(row => row.group_id === group._id)) {
            const student = await ctx.db.get(membership.student_id);
            if (student && student.status !== 'archived' && student._creationTime <= Date.parse(`${lesson.date}T${lesson.time}:00+04:00`) && !marked.has(student._id)) missing++;
        }
        if (!missing) return null;
        const record = { dueAt, status: 'sending' as const, attemptedAt: now, attempts: (sameSchedule ? previous.attempts : 0) + 1 };
        const notificationId = previous ? previous._id : await ctx.db.insert('teacher_notifications', { lessonId, userId: teacher._id, kind: 'attendance_reminder', ...record });
        if (previous) await ctx.db.patch(previous._id, record);
        const preference = await ctx.db.query('bot_preferences').withIndex('by_telegram', q => q.eq('telegramId', teacher.tokenIdentifier)).unique();
        return { language: preference?.language ?? 'en', notificationId, chatId: teacher.tokenIdentifier, groupName: group.name, date: lesson.date, time: lesson.time };
    },
});

export const finish = internalMutation({
    args: { id: v.id('teacher_notifications'), dueAt: v.number(), status: v.union(v.literal('sent'), v.literal('failed'), v.literal('unknown'), v.literal('blocked')) },
    handler: async (ctx, args) => {
        const record = await ctx.db.get(args.id);
        if (!record || record.dueAt !== args.dueAt) return;
        const lesson = await ctx.db.get(record.lessonId);
        if (!lesson || record.dueAt !== lesson.reminderDueAt) return;
        await ctx.db.patch(args.id, { status: args.status });
        if (args.status === 'failed' && record.attempts < 3 && record.dueAt !== undefined) {
            const reminderJobId = await ctx.scheduler.runAfter(5 * 60_000, internal.notifications.deliverLesson, { lessonId: lesson._id, dueAt: record.dueAt });
            await ctx.db.patch(lesson._id, { reminderJobId });
        }
    },
});

export const deliverLesson = internalAction({
    args: { lessonId: v.id('lessons'), dueAt: v.number() },
    handler: async (ctx, args): Promise<void> => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const appUrl = process.env.SUICA_APP_URL;
        if (!token || !appUrl || process.env.TEACHER_NOTIFICATIONS_ENABLED !== 'true') return;
        const reminder = await ctx.runMutation(internal.notifications.claim, args);
        if (!reminder) return;
        const message = attendanceMessage(reminder.language, reminder);
        let status: 'sent' | 'failed' | 'unknown' | 'blocked' = 'unknown';
        try {
            const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: reminder.chatId, text: message.text,
                    reply_markup: { inline_keyboard: [[{ text: message.button, web_app: { url: attendanceUrl(appUrl, args.lessonId) } }]] },
                }), signal: AbortSignal.timeout(15_000),
            });
            const body: unknown = await response.json();
            if (typeof body === 'object' && body !== null && 'ok' in body) status = body.ok === true ? 'sent' : response.status === 403 ? 'blocked' : 'failed';
        } catch {
            console.warn('Telegram notification delivery uncertain', { notificationId: reminder.notificationId });
        }
        await ctx.runMutation(internal.notifications.finish, { id: reminder.notificationId, dueAt: args.dueAt, status });
    },
});

export const backfillReminders = internalMutation({
    args: { cursor: v.union(v.string(), v.null()) },
    handler: async (ctx, args): Promise<{ cursor: string; done: boolean; changed: number; scanned: number }> => {
        const page = await ctx.db.query('lessons').paginate({ cursor: args.cursor, numItems: 100 });
        let changed = 0;
        for (const lesson of page.page) if (await syncLessonReminder(ctx, lesson)) changed++;
        return { cursor: page.continueCursor, done: page.isDone, changed, scanned: page.page.length };
    },
});

// Both the command and the recipient are fixed to the developer account.
export const requestDeveloperTest = internalMutation({
    args: { updateId: v.number() },
    handler: async (ctx, args) => {
        const telegramId = DEVELOPER_TELEGRAM_ID;
        const preference = await ctx.db.query('bot_preferences').withIndex('by_telegram', q => q.eq('telegramId', telegramId)).unique();
        const now = Date.now();
        if (preference && (args.updateId <= (preference.lastTestUpdateId ?? -1) || now - (preference.lastTestRequestedAt ?? 0) < 5000)) return;
        if (preference) await ctx.db.patch(preference._id, { lastTestUpdateId: args.updateId, lastTestRequestedAt: now });
        else await ctx.db.insert('bot_preferences', { telegramId, language: 'en', lastUpdateId: -1, lastTestUpdateId: args.updateId, lastTestRequestedAt: now });
        await ctx.scheduler.runAfter(0, internal.notifications.sendDeveloperTest, {});
    },
});

export const developerLastLesson = internalQuery({
    args: {},
    handler: async ctx => {
        const telegramId = DEVELOPER_TELEGRAM_ID;
        const lessons = await ctx.db.query('lessons').withIndex('by_user', q => q.eq('userId', telegramId)).collect();
        const now = Date.now();
        const past = lessons.filter(lesson => lesson.status !== 'cancelled' && Date.parse(`${lesson.date}T${lesson.time}:00+04:00`) + lesson.duration_minutes * 60_000 <= now);
        past.sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
        const lesson = past[0];
        if (!lesson) return null;
        const group = await ctx.db.get(lesson.group_id);
        if (!group) return null;
        const preference = await ctx.db.query('bot_preferences').withIndex('by_telegram', q => q.eq('telegramId', telegramId)).unique();
        return { lessonId: lesson._id, groupName: group.name, language: preference?.language ?? 'en' };
    },
});

export const sendDeveloperTest = internalAction({
    args: {},
    handler: async (ctx): Promise<{ sent: boolean; hasLesson: boolean }> => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const appUrl = process.env.SUICA_APP_URL;
        if (!token || !appUrl) throw new Error('Telegram notification settings missing');
        const lesson = await ctx.runQuery(internal.notifications.developerLastLesson, {});
        const message = lesson ? attendanceMessage(lesson.language, lesson) : null;
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
                chat_id: DEVELOPER_TELEGRAM_ID,
                text: message?.text ?? 'No past lessons found for your developer account.',
                ...(lesson && message ? { reply_markup: { inline_keyboard: [[{ text: message.button, web_app: { url: attendanceUrl(appUrl, lesson.lessonId) } }]] } } : {}),
            }),
        });
        const result: unknown = await response.json();
        if (!response.ok || typeof result !== 'object' || result === null || !('ok' in result) || result.ok !== true) throw new Error(`Developer notification failed (${response.status})`);
        return { sent: true, hasLesson: !!lesson };
    },
});

export const auditReminderJobs = internalQuery({
    args: { cursor: v.union(v.string(), v.null()) },
    handler: async (ctx, args) => {
        const page = await ctx.db.query('lessons').paginate({ cursor: args.cursor, numItems: 100 });
        let pending = 0;
        let mismatched = 0;
        for (const lesson of page.page) {
            if (!lesson.reminderJobId) continue;
            const job = await ctx.db.system.get(lesson.reminderJobId);
            if (job?.state.kind === 'pending') {
                pending++;
                if (job.scheduledTime !== Math.max(lesson.reminderDueAt ?? 0, job.scheduledTime) || lessonReminderTime(lesson) !== lesson.reminderDueAt || lesson.status === 'cancelled') mismatched++;
            }
        }
        return { cursor: page.continueCursor, done: page.isDone, pending, mismatched };
    },
});

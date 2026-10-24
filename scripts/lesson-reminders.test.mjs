import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'suica-reminder-test-'));
await build({ entryPoints: ['convex/lessonReminders.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'helper.mjs') });
const { syncLessonReminder, deleteScheduledLesson } = await import(pathToFileURL(join(dir, 'helper.mjs')));
try {
    test('unchanged sync reuses its job, time changes cancel and replace, cancellation and deletion cancel', async () => {
        const jobs = new Map();
        const cancelled = [];
        let number = 0;
        const lesson = { _id: 'lesson', date: '2099-10-14', time: '19:00', duration_minutes: 60, status: 'upcoming' };
        const ctx = {
            db: { system: { get: async id => jobs.get(id) }, patch: async (id, patch) => Object.assign(lesson, patch), delete: async () => { lesson.deleted = true; } },
            scheduler: {
                runAt: async (at, fn, args) => { const id = `job${++number}`; jobs.set(id, { _id: id, state: { kind: 'pending' }, scheduledTime: at, args }); return id; },
                cancel: async id => { cancelled.push(id); jobs.get(id).state.kind = 'canceled'; },
            },
        };
        assert.equal(await syncLessonReminder(ctx, lesson), true);
        const first = lesson.reminderJobId;
        assert.equal(jobs.get(first).scheduledTime, Date.parse('2099-10-14T21:00:00+04:00'));
        assert.equal(await syncLessonReminder(ctx, lesson), false);
        assert.equal(number, 1);
        lesson.time = '20:00';
        assert.equal(await syncLessonReminder(ctx, lesson), true);
        assert.deepEqual(cancelled, [first]);
        assert.equal(number, 2);
        assert.equal(jobs.get(lesson.reminderJobId).scheduledTime, Date.parse('2099-10-14T22:00:00+04:00'));
        lesson.status = 'cancelled';
        await syncLessonReminder(ctx, lesson);
        assert.equal(lesson.reminderJobId, undefined);
        assert.equal(cancelled.length, 2);
        lesson.status = 'upcoming';
        await syncLessonReminder(ctx, lesson);
        await deleteScheduledLesson(ctx, lesson);
        assert.equal(cancelled.length, 3);
        assert.equal(lesson.deleted, true);
    });
} finally {
    // Tests retain the imported module; the temporary bundle is no longer needed.
    await rm(dir, { recursive: true, force: true });
}

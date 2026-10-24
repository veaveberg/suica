import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import rateLimiter from '@convex-dev/rate-limiter/test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import { calendarRelayUrl } from '../convex/calendarSource';
import { createSessionToken, verifySessionToken } from '../convex/session';
import { authenticateTelegram, type TelegramLoginData } from '../convex/telegramAuth';
import { transfer } from '../convex/migrations/transfer_user_data';
import { copy } from '../convex/migrations/copy_groups_schedules';
import { renameCurrentAbsencesToLegacy, recalculateAttendanceById } from '../convex/migrations/legacy_absence_statuses';

const modules = import.meta.glob('../convex/**/*.ts');
const botToken = 'test-only-bot-token';
const nowSeconds = () => Math.floor(Date.now() / 1000);
const user = { id: 12345, first_name: 'Alice', username: 'alice' };

async function sign(keyBytes: Uint8Array<ArrayBuffer>, value: string) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
async function miniApp(fields: Record<string, string> = {}) {
    const params = new URLSearchParams({ auth_date: String(nowSeconds()), user: JSON.stringify(user), ...fields });
    const check = Array.from(params.entries()).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = await sign(new TextEncoder().encode('WebAppData'), botToken);
    params.set('hash', hex(await sign(secret, check)));
    return params.toString();
}
async function widget(profile: TelegramLoginData = { ...user, auth_date: nowSeconds() }) {
    const secret = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken)));
    const check = Object.entries(profile).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${k}=${v}`).join('\n');
    return { ...profile, hash: hex(await sign(secret, check)) };
}

beforeEach(() => {
    vi.stubEnv('SUICA_SESSION_SECRET', 'test-only-session-secret-with-at-least-32-characters');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', botToken);
});
afterEach(() => vi.unstubAllEnvs());

async function fixture() {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const records = await t.run(async ctx => {
        const teacher = await ctx.db.insert('users', { tokenIdentifier: '100', role: 'teacher' });
        const otherTeacher = await ctx.db.insert('users', { tokenIdentifier: '200', role: 'teacher' });
        const studentUser = await ctx.db.insert('users', { tokenIdentifier: '300', role: 'student' });
        const group = await ctx.db.insert('groups', { name: 'A', color: '#000', default_duration_minutes: 60, status: 'active', userId: '100' });
        const otherGroup = await ctx.db.insert('groups', { name: 'B', color: '#000', default_duration_minutes: 60, status: 'active', userId: '200' });
        const student = await ctx.db.insert('students', { name: 'A', userId: '100' });
        const otherStudent = await ctx.db.insert('students', { name: 'B', userId: '200' });
        const lesson = await ctx.db.insert('lessons', { group_id: group, date: '2020-01-01', time: '12:00', duration_minutes: 60, students_count: 0, total_amount: 0, status: 'completed', userId: '100' });
        const otherLesson = await ctx.db.insert('lessons', { group_id: otherGroup, date: '2020-01-01', time: '12:00', duration_minutes: 60, students_count: 0, total_amount: 0, status: 'completed', userId: '200' });
        const otherSchedule = await ctx.db.insert('schedules', { group_id: otherGroup, day_of_week: 1, time: '12:00', is_active: true, userId: '200' });
        const otherPass = await ctx.db.insert('passes', { name: 'B', price: 10, lessons_count: 1, is_consecutive: false, userId: '200' });
        const attendance = await ctx.db.insert('attendance', { lesson_id: otherLesson, student_id: otherStudent, status: 'present', userId: '200' });
        return { teacher, otherTeacher, studentUser, group, otherGroup, student, otherStudent, lesson, otherLesson, otherSchedule, otherPass, attendance };
    });
    return { t, ...records, auth: { userId: records.teacher, authToken: await createSessionToken(records.teacher, 'teacher') } };
}

describe('Telegram authentication', () => {
    test('widget signatures, expiry, future dates and tampering', async () => {
        const valid = await widget();
        expect(await authenticateTelegram('login_widget', valid, botToken)).toMatchObject(user);
        expect(await authenticateTelegram('login_widget', { ...valid, id: 999 }, botToken)).toBeNull();
        expect(await authenticateTelegram('login_widget', await widget({ ...user, auth_date: nowSeconds() - 86401 }), botToken)).toBeNull();
        expect(await authenticateTelegram('login_widget', await widget({ ...user, auth_date: nowSeconds() + 3600 }), botToken)).toBeNull();
    });
    test('Mini App uses signed profile and rejects missing, mismatched, duplicated or tampered identity', async () => {
        const data = await miniApp();
        expect(await authenticateTelegram(data, { ...user, username: 'victim' }, botToken)).toEqual(user);
        expect(await authenticateTelegram(data, { ...user, id: 999 }, botToken)).toBeNull();
        expect(await authenticateTelegram(await miniApp({ user: 'null' }), user, botToken)).toBeNull();
        expect(await authenticateTelegram(`${data}&user=${encodeURIComponent(JSON.stringify(user))}`, user, botToken)).toBeNull();
        expect(await authenticateTelegram(data.replace('alice', 'other'), user, botToken)).toBeNull();
    });
    test('insecure environment flag cannot bypass signatures; failed attempts persist', async () => {
        const { t } = await fixture();
        vi.stubEnv('ALLOW_INSECURE_TELEGRAM_AUTH', 'true');
        for (let i = 0; i < 5; i++) {
            await expect(t.action(api.users.login, { initData: '', userData: user })).rejects.toThrow('Invalid Telegram authentication');
        }
        await expect(t.action(api.users.login, { initData: '', userData: user })).rejects.toThrow(/RateLimited/);
        expect(await t.run(ctx => ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', String(user.id))).first())).toBeNull();
    });
    test('real login links signed username only and cannot take an already linked Telegram identity', async () => {
        const { t } = await fixture();
        await t.run(async ctx => {
            await ctx.db.insert('students', { name: 'Victim', telegram_username: 'victim', userId: '100' });
            await ctx.db.insert('students', { name: 'Old owner', telegram_username: 'alice', telegram_id: '999', userId: '100' });
        });
        const result = await t.action(api.users.login, { initData: await miniApp(), userData: { ...user, username: 'victim' } });
        expect(result.username).toBe('alice');
        expect(await verifySessionToken(result.sessionToken)).toMatchObject({ userId: result._id, role: 'student' });
        expect(await t.run(ctx => ctx.db.query('students').withIndex('by_telegram_username', q => q.eq('telegram_username', 'victim')).first())).not.toHaveProperty('telegram_id');
        expect(await t.run(ctx => ctx.db.query('students').withIndex('by_telegram_username', q => q.eq('telegram_username', 'alice')).first())).toHaveProperty('telegram_id', '999');
    });
    test('backdoor is disabled by default and changing targets does not reset failed-attempt limits', async () => {
        const { t } = await fixture();
        vi.stubEnv('ALLOW_BACKDOOR_LOGIN', 'false');
        await expect(t.action(api.users.backdoorLogin, { targetTelegramId: 1, accessSecret: 'wrong' })).rejects.toThrow('disabled');
        vi.stubEnv('ALLOW_BACKDOOR_LOGIN', 'true');
        vi.stubEnv('BACKDOOR_LOGIN_SECRET', 'test-only-long-random-secret-for-backdoor');
        for (let i = 0; i < 3; i++) {
            await expect(t.action(api.users.backdoorLogin, { targetTelegramId: i + 1, accessSecret: 'wrong' })).rejects.toThrow('Invalid backdoor credentials');
        }
        await expect(t.action(api.users.backdoorLogin, { targetTelegramId: 999, accessSecret: 'wrong' })).rejects.toThrow(/RateLimited/);
    });
});

describe('teacher record isolation', () => {
    test('foreign attendance cannot be marked, synced, deleted, or bulk inserted', async () => {
        const f = await fixture();
        await expect(f.t.mutation(api.attendance.mark, { ...f.auth, lesson_id: f.otherLesson, student_id: f.otherStudent, status: 'absence_invalid' })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.attendance.mark, { ...f.auth, lesson_id: f.lesson, student_id: f.otherStudent, status: 'present' })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.attendance.syncLessonAttendance, { ...f.auth, lesson_id: f.otherLesson, attendance: [] })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.attendance.syncLessonAttendance, { ...f.auth, lesson_id: f.lesson, attendance: [{ student_id: f.otherStudent, status: 'present' }] })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.attendance.remove, { ...f.auth, id: f.attendance })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.attendance.bulkCreate, { ...f.auth, attendance: [{ lesson_id: f.otherLesson, student_id: f.student, status: 'present' }] })).rejects.toThrow('Unauthorized');
        expect(await f.t.run(ctx => ctx.db.get(f.attendance))).toHaveProperty('status', 'present');
    });
    test('foreign student and pass associations are rejected; owned associations still work', async () => {
        const f = await fixture();
        await expect(f.t.mutation(api.student_groups.create, { ...f.auth, student_id: f.otherStudent, group_id: f.group })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.student_groups.create, { ...f.auth, student_id: f.student, group_id: f.otherGroup })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.pass_groups.create, { ...f.auth, pass_id: f.otherPass, group_id: f.group })).rejects.toThrow('Unauthorized');
        const id = await f.t.mutation(api.student_groups.create, { ...f.auth, student_id: f.student, group_id: f.group });
        expect(await f.t.run(ctx => ctx.db.get(id))).toMatchObject({ student_id: f.student, group_id: f.group, userId: '100' });
    });
    test('foreign groups and schedules cannot be used to create or generate lessons', async () => {
        const f = await fixture();
        const lesson = { date: '2020-01-01', time: '12:00', duration_minutes: 60, status: 'completed' as const };
        await expect(f.t.mutation(api.lessons.create, { ...f.auth, ...lesson, group_id: f.otherGroup })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.lessons.create, { ...f.auth, ...lesson, group_id: f.group, schedule_id: f.otherSchedule })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.lessons.update, { ...f.auth, id: f.lesson, updates: { schedule_id: f.otherSchedule } })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.lessons.bulkCreate, { ...f.auth, lessons: [{ ...lesson, group_id: f.otherGroup }] })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.lessons.generateMore, { ...f.auth, groupId: f.otherGroup, count: 1 })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.lessons.syncFromSchedule, { ...f.auth, groupId: f.otherGroup, today: '2020-01-01' })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.schedules.create, { ...f.auth, group_id: f.otherGroup, day_of_week: 1, time: '12:00', is_active: true })).rejects.toThrow('Unauthorized');
        const id = await f.t.mutation(api.lessons.create, { ...f.auth, ...lesson, group_id: f.group });
        expect(await f.t.run(ctx => ctx.db.get(id))).toHaveProperty('userId', '100');
    });
    test('subscriptions cannot reference foreign students, groups or pricing', async () => {
        const f = await fixture();
        const sub = { ...f.auth, user_id: f.student, group_id: f.group, type: 'pass', lessons_total: 1, price: 10, purchase_date: '2020-01-01', is_consecutive: false, status: 'active' as const };
        await expect(f.t.mutation(api.subscriptions.create, { ...sub, user_id: f.otherStudent })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.subscriptions.create, { ...sub, group_id: f.otherGroup })).rejects.toThrow('Unauthorized');
        await expect(f.t.mutation(api.subscriptions.create, { ...sub, tariff_id: f.otherPass })).rejects.toThrow('Unauthorized');
    });
    test('forged, expired, student, and role-stale sessions cannot mutate teacher data', async () => {
        const f = await fixture();
        const args = { ...f.auth, student_id: f.student, group_id: f.group };
        await expect(f.t.mutation(api.student_groups.create, { ...args, authToken: `${f.auth.authToken}0` })).rejects.toThrow('Unauthenticated');
        const studentToken = await createSessionToken(f.studentUser, 'student');
        await expect(f.t.mutation(api.student_groups.create, { ...args, userId: f.studentUser, authToken: studentToken })).rejects.toThrow('Teacher access');
        const mismatched = await createSessionToken(f.otherTeacher, 'teacher');
        await expect(f.t.mutation(api.student_groups.create, { ...args, authToken: mismatched })).rejects.toThrow('Unauthenticated');
        await f.t.run(ctx => ctx.db.patch(f.teacher, { role: 'student' }));
        await expect(f.t.mutation(api.student_groups.create, args)).rejects.toThrow('Unauthenticated');
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 86400000);
        try { expect(await verifySessionToken(f.auth.authToken)).toBeNull(); } finally { vi.restoreAllMocks(); }
    });
});

test('destructive migrations are internal, never public client functions', () => {
    for (const migration of [transfer, copy, renameCurrentAbsencesToLegacy, recalculateAttendanceById]) {
        expect(migration).toHaveProperty('isInternal', true);
        expect(migration).not.toHaveProperty('isPublic', true);
    }
});

describe('private calendar relay', () => {
    test('rejects local hosts, credentials, custom ports, and lookalike publisher domains', () => {
        for (const url of ['https://127.0.0.1/feed', 'http://calendar.google.com/feed', 'https://calendar.google.com.evil.example/feed', 'https://evil.example/?calendar.google.com', 'https://calendar.google.com@evil.example/feed', 'https://user:pass@calendar.google.com/feed', 'https://calendar.google.com:1234/feed', 'https://[::1]/feed']) {
            expect(() => calendarRelayUrl(url)).toThrow();
        }
        expect(calendarRelayUrl('webcal://p123-caldav.icloud.com/published/secret')).toBe('https://p123-caldav.icloud.com/published/secret');
    });
    test('uses owned stored feed, blocks foreign access, forbids redirects, and caps response size', async () => {
        const f = await fixture();
        const ids = await f.t.run(async ctx => ({
            owned: await ctx.db.insert('external_calendars', { userId: '100', name: 'Own', url: 'https://calendar.google.com/calendar/ical/private/basic.ics', color: '#000', enabled: true }),
            other: await ctx.db.insert('external_calendars', { userId: '200', name: 'Other', url: 'https://calendar.google.com/calendar/ical/other/basic.ics', color: '#000', enabled: true }),
            local: await ctx.db.insert('external_calendars', { userId: '100', name: 'Local', url: 'https://127.0.0.1/admin', color: '#000', enabled: true }),
        }));
        // Only the remote publisher is stubbed. Auth, queries, rate limits and
        // the relay function run through the Convex test backend.
        const remote = vi.fn().mockResolvedValue(new Response('BEGIN:VCALENDAR\nEND:VCALENDAR'));
        vi.stubGlobal('fetch', remote);
        try {
            await expect(f.t.action(api.calendarFeeds.fetchFeed, { ...f.auth, calendarId: ids.other })).rejects.toThrow('Unauthorized');
            await expect(f.t.action(api.calendarFeeds.fetchFeed, { ...f.auth, calendarId: ids.local })).rejects.toThrow('not supported');
            await expect(f.t.action(api.calendarFeeds.fetchFeed, { ...f.auth, authToken: 'forged', calendarId: ids.owned })).rejects.toThrow('Unauthenticated');
            expect(remote).not.toHaveBeenCalled();
            expect(await f.t.action(api.calendarFeeds.fetchFeed, { ...f.auth, calendarId: ids.owned })).toContain('BEGIN:VCALENDAR');
            expect(remote).toHaveBeenCalledWith('https://calendar.google.com/calendar/ical/private/basic.ics', expect.objectContaining({ redirect: 'error' }));
            remote.mockResolvedValueOnce(new Response('x'.repeat(5 * 1024 * 1024 + 1)));
            await expect(f.t.action(api.calendarFeeds.fetchFeed, { ...f.auth, calendarId: ids.owned })).rejects.toThrow('exceeds 5 MB');
            remote.mockResolvedValueOnce(new Response('not a calendar'));
            await expect(f.t.action(api.calendarFeeds.fetchFeed, { ...f.auth, calendarId: ids.owned })).rejects.toThrow('invalid');
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

test('profile edits cannot claim a Telegram username or make legacy usernames trusted', async () => {
    const f = await fixture();
    await expect(f.t.mutation(api.users.updateProfile, { ...f.auth, updates: { username: 'victim' } })).rejects.toThrow('verified Telegram login');
    await f.t.mutation(api.users.updateProfile, { ...f.auth, updates: { name: 'New name', instagram_username: 'instagram' } });
    expect(await f.t.run(ctx => ctx.db.get(f.teacher))).toMatchObject({ name: 'New name', instagram_username: 'instagram' });
    await f.t.run(ctx => ctx.db.patch(f.otherTeacher, { username: 'unverified' }));
    const student = await f.t.mutation(api.students.create, { ...f.auth, name: 'Unverified', telegram_username: 'unverified' });
    expect(await f.t.run(ctx => ctx.db.get(student))).not.toHaveProperty('telegram_id');
    await f.t.run(ctx => ctx.db.patch(f.otherTeacher, { telegramUsernameVerified: true }));
    const linked = await f.t.mutation(api.students.create, { ...f.auth, name: 'Verified', telegram_username: 'unverified' });
    expect(await f.t.run(ctx => ctx.db.get(linked))).toHaveProperty('telegram_id', '200');
});

test('sessions require a dedicated strong secret even when a bot token exists', async () => {
    const f = await fixture();
    for (const secret of ['', 'short']) {
        vi.stubEnv('SUICA_SESSION_SECRET', secret);
        await expect(createSessionToken(f.teacher, 'teacher')).rejects.toThrow('at least 32 characters');
    }
});

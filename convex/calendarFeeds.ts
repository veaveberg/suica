import { v } from 'convex/values';
import { action, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { ensureTeacher } from './permissions';
import { calendarRelayUrl } from './calendarSource';

const feedArgs = { userId: v.id('users'), authToken: v.string(), calendarId: v.id('external_calendars') };

export const resolveSource = internalQuery({
    args: feedArgs,
    handler: async (ctx, args) => {
        const user = await ensureTeacher(ctx, args.userId, args.authToken);
        const calendar = await ctx.db.get(args.calendarId);
        if (!calendar || (user.role !== 'admin' && calendar.userId !== user.tokenIdentifier)) throw new Error('Unauthorized');
        return calendarRelayUrl(calendar.url);
    },
});

export const fetchFeed = action({
    args: feedArgs,
    handler: async (ctx, args): Promise<string> => {
        const url = await ctx.runQuery(internal.calendarFeeds.resolveSource, args);
        await ctx.runMutation(internal.rateLimitActions.checkCalendarExportLimit, { key: `feed:${args.userId}` });
        const response = await fetch(url, {
            headers: { Accept: 'text/calendar' },
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok || !response.body) throw new Error('Calendar fetch failed');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let length = 0;
        let body = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                length += value.byteLength;
                if (length > 5 * 1024 * 1024) throw new Error('Calendar exceeds 5 MB');
                body += decoder.decode(value, { stream: true });
            }
            body += decoder.decode();
        } finally {
            await reader.cancel();
        }
        if (!body.includes('BEGIN:VCALENDAR')) throw new Error('Calendar response is invalid');
        return body;
    },
});

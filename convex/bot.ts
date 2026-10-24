import { v } from 'convex/values';
import { internalMutation, httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { botCopy, languageKeyboard, parseLanguageUpdate } from './botLanguage';
import { botLanguageValidator } from './botValidators';

declare const process: { env: Record<string, string | undefined> };

export const preference = internalMutation({
    args: { telegramId: v.string(), language: botLanguageValidator, explicit: v.boolean(), updateId: v.number() },
    handler: async (ctx, args) => {
        const existing = await ctx.db.query('bot_preferences').withIndex('by_telegram', q => q.eq('telegramId', args.telegramId)).unique();
        if (existing) {
            if (args.explicit && args.updateId > existing.lastUpdateId) {
                await ctx.db.patch(existing._id, { language: args.language, lastUpdateId: args.updateId });
                return args.language;
            }
            return existing.language;
        }
        await ctx.db.insert('bot_preferences', { telegramId: args.telegramId, language: args.language, lastUpdateId: args.updateId });
        return args.language;
    },
});

async function telegram(method: string, body: Record<string, unknown>) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('Telegram bot is not configured');
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    const result: unknown = await response.json();
    if (!response.ok || typeof result !== 'object' || result === null || !('ok' in result) || result.ok !== true) {
        throw new Error(`Telegram ${method} failed (${response.status})`);
    }
}

export const webhook = httpAction(async (ctx, request) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) {
        return new Response('Unauthorized', { status: 401 });
    }
    let payload: unknown;
    try { payload = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
    const update = parseLanguageUpdate(payload);
    if (!update) return new Response('OK');
    if (update.kind === 'test') {
        await ctx.runMutation(internal.notifications.requestDeveloperTest, { updateId: update.updateId });
        return new Response('OK');
    }
    const language = await ctx.runMutation(internal.bot.preference, {
        telegramId: update.telegramId, language: update.kind === 'save' ? update.language : update.defaultLanguage,
        explicit: update.kind === 'save', updateId: update.updateId,
    });
    const copy = botCopy[language];
    if (update.kind === 'save') {
        await telegram('answerCallbackQuery', { callback_query_id: update.callbackId, text: copy.saved }).catch(() => {
            // Retried callbacks may have expired; the preference is already saved.
            console.warn('Bot language callback acknowledgement failed', { updateId: update.updateId });
        });
        // Keep the chooser available so the user can switch again without typing a command.
        await telegram('editMessageText', { chat_id: update.telegramId, message_id: update.messageId, text: `${copy.saved}\n\n${copy.choose}`, reply_markup: languageKeyboard(language) }).catch(() => {
            // Repeated updates can attempt to edit an already identical message.
            console.warn('Bot language chooser edit failed', { updateId: update.updateId });
        });
    } else {
        await telegram('sendMessage', { chat_id: update.telegramId, text: copy.choose, reply_markup: languageKeyboard(language) });
    }
    return new Response('OK');
});

// Administrator override. Reset update ordering so the user can change language
// again with /language; an admin operation is not a Telegram update.
export const setLanguage = internalMutation({
    args: { telegramId: v.string(), language: botLanguageValidator },
    handler: async (ctx, args) => {
        const existing = await ctx.db.query('bot_preferences').withIndex('by_telegram', q => q.eq('telegramId', args.telegramId)).unique();
        if (existing) await ctx.db.patch(existing._id, { language: args.language, lastUpdateId: -1 });
        else await ctx.db.insert('bot_preferences', { ...args, lastUpdateId: -1 });
        return args.language;
    },
});

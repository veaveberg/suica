export const botLanguages = ['en', 'ru', 'uk', 'be', 'ka'] as const;
export type BotLanguage = typeof botLanguages[number];
export function isBotLanguage(value: unknown): value is BotLanguage {
    return value === 'ru' || value === 'ka' || value === 'en' || value === 'uk' || value === 'be';
}
export function defaultBotLanguage(value: unknown): BotLanguage {
    const code = typeof value === 'string' ? value.toLowerCase().split('-')[0] : undefined;
    return isBotLanguage(code) ? code : 'en';
}
export const botCopy = {
    ru: { name: 'Русский', choose: 'Выберите язык бота:', saved: 'Язык бота: русский.', attendance: 'Отметить посещаемость', reminder: 'Отметьте посещаемость в группе {group}' },
    ka: { name: 'ქართული', choose: 'აირჩიეთ ბოტის ენა:', saved: 'ბოტის ენა: ქართული.', attendance: 'დასწრების აღნიშვნა', reminder: 'აღნიშნეთ დასწრება ჯგუფში {group}' },
    en: { name: 'English', choose: 'Choose the bot language:', saved: 'Bot language: English.', attendance: 'Mark attendance', reminder: 'Mark attendance for your last {group} class' },
    uk: { name: 'Українська', choose: 'Виберіть мову бота:', saved: 'Мова бота: українська.', attendance: 'Позначити відвідування', reminder: 'Позначте відвідування в групі {group}' },
    be: { name: 'Беларуская', choose: 'Выберыце мову бота:', saved: 'Мова бота: беларуская.', attendance: 'Адзначыць наведвальнасць', reminder: 'Адзначце наведвальнасць у групе {group}' },
} satisfies Record<BotLanguage, { name: string; choose: string; saved: string; attendance: string; reminder: string }>;

export function languageKeyboard(language: BotLanguage) {
    return { inline_keyboard: botLanguages.map(code => [{ text: `${code === language ? '✓ ' : ''}${botCopy[code].name}`, callback_data: `language:${code}` }]) };
}
export function attendanceMessage(language: BotLanguage, lesson: { groupName: string }) {
    const copy = botCopy[language];
    return { text: copy.reminder.replace('{group}', () => lesson.groupName), button: copy.attendance };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> | null {
    return isObject(value) ? value : null;
}
function telegramId(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
export const DEVELOPER_TELEGRAM_ID = '129516266';

export type LanguageUpdate =
    | { kind: 'test'; updateId: number; telegramId: string }
    | { kind: 'choose'; updateId: number; telegramId: string; defaultLanguage: BotLanguage }
    | { kind: 'save'; updateId: number; telegramId: string; language: BotLanguage; callbackId: string; messageId: number };
export function parseLanguageUpdate(value: unknown): LanguageUpdate | null {
    const update = object(value);
    if (!update || typeof update.update_id !== 'number' || !Number.isSafeInteger(update.update_id)) return null;
    const callback = object(update.callback_query);
    const message = object(callback ? callback.message : update.message);
    const from = object(callback ? callback.from : message?.from);
    const chat = object(message?.chat);
    if (!message || !from || !chat || chat.type !== 'private' || !telegramId(from.id) || chat.id !== from.id || from.is_bot === true) return null;
    const telegramUserId = String(from.id);
    if (callback) {
        const language = typeof callback.data === 'string' && callback.data.startsWith('language:') ? callback.data.slice(9) : null;
        if (!isBotLanguage(language) || typeof callback.id !== 'string' || !telegramId(message.message_id)) return null;
        return { kind: 'save', updateId: update.update_id, telegramId: telegramUserId, language, callbackId: callback.id, messageId: message.message_id };
    }
    if (typeof message.text === 'string' && /^\/test_notification(?:@\w+)?(?:\s|$)/.test(message.text)) {
        return telegramUserId === DEVELOPER_TELEGRAM_ID ? { kind: 'test', updateId: update.update_id, telegramId: telegramUserId } : null;
    }
    if (typeof message.text !== 'string' || !/^\/(start|language|settings|help)(?:@\w+)?(?:\s|$)/.test(message.text)) return null;
    return { kind: 'choose', updateId: update.update_id, telegramId: telegramUserId, defaultLanguage: defaultBotLanguage(from.language_code) };
}

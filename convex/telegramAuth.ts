export type TelegramLoginData = {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date?: number;
    hash?: string;
};

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const MAX_CLOCK_SKEW_SECONDS = 30;

function isFresh(authDate: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return Number.isSafeInteger(authDate) && authDate > 0
        && authDate <= now + MAX_CLOCK_SKEW_SECONDS
        && now - authDate <= MAX_AUTH_AGE_SECONDS;
}

async function hmac(keyBytes: Uint8Array<ArrayBuffer>, payload: string): Promise<ArrayBuffer> {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
}

function equalHash(signature: ArrayBuffer, hash: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(hash)) return false;
    const expected = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('');
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ hash.charCodeAt(i);
    return difference === 0;
}

function checkString(entries: Iterable<[string, string]>): string {
    return Array.from(entries).filter(([key]) => key !== 'hash')
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, value]) => `${key}=${value}`).join('\n');
}

function parseUser(value: unknown): TelegramLoginData | null {
    if (typeof value !== 'object' || value === null || !('id' in value) || !('first_name' in value)) return null;
    if (typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || value.id <= 0 || typeof value.first_name !== 'string') return null;
    const user: TelegramLoginData = { id: value.id, first_name: value.first_name };
    for (const key of ['last_name', 'username', 'photo_url'] as const) {
        const field: unknown = Reflect.get(value, key);
        if (field !== undefined) {
            if (typeof field !== 'string') return null;
            user[key] = field;
        }
    }
    return user;
}

// Return the signed profile. Unsigned client fields must never link a student
// record by username or supply another user's Telegram ID.
export async function authenticateTelegram(
    initData: string,
    submittedUser: TelegramLoginData,
    botToken: string,
): Promise<TelegramLoginData | null> {
    if (initData && initData.includes('=')) {
        const params = new URLSearchParams(initData);
        const keys = Array.from(params.keys());
        if (new Set(keys).size !== keys.length) return null;
        const hash = params.get('hash');
        const authDate = Number(params.get('auth_date'));
        if (!hash || !isFresh(authDate)) return null;
        const secret = await hmac(new TextEncoder().encode('WebAppData'), botToken);
        if (!equalHash(await hmac(new Uint8Array(secret), checkString(params.entries())), hash)) return null;
        try {
            const user = parseUser(JSON.parse(params.get('user') ?? 'null'));
            return user && user.id === submittedUser.id ? user : null;
        } catch {
            return null;
        }
    }

    const user = parseUser(submittedUser);
    if (!user || !submittedUser.hash || !submittedUser.auth_date || !isFresh(submittedUser.auth_date)) return null;
    const entries: Array<[string, string]> = [['id', String(user.id)], ['first_name', user.first_name], ['auth_date', String(submittedUser.auth_date)]];
    for (const key of ['last_name', 'username', 'photo_url'] as const) {
        if (user[key] !== undefined) entries.push([key, user[key]]);
    }
    const secret = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken));
    return equalHash(await hmac(new Uint8Array(secret), checkString(entries)), submittedUser.hash) ? user : null;
}

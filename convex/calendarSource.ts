// Only these calendar publishers can be fetched by the backend. Never accept
// arbitrary hosts or redirects: that would expose a server-side request proxy.
export function calendarSourceUrl(value: string): URL {
    const url = new URL(value.replace(/^webcal:\/\//i, 'https://'));
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
        throw new Error('Calendar source must use HTTPS without credentials or a custom port');
    }
    return url;
}

export function calendarRelayUrl(value: string): string {
    const url = calendarSourceUrl(value);
    const allowed = ['calendar.google.com', 'outlook.office365.com', 'outlook.live.com'];
    if (!allowed.includes(url.hostname) && !/^p\d{2,3}-caldav\.icloud\.com$/.test(url.hostname)) {
        throw new Error('This calendar publisher is not supported by the private relay');
    }
    return url.toString();
}

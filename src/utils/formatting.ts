import { i18n } from 'i18next';

/**
 * Returns the locale string for Intl formatting based on language code.
 */
export function getLocale(lang: string): string {
    const upperLang = lang.toUpperCase();
    return upperLang === 'KA' ? 'ka-GE' : upperLang === 'RU' ? 'ru' : 'en-US';
}

export interface FormatDateOptions {
    includeWeekday?: boolean;
    weekdayFormat?: 'short' | 'long';
}

/**
 * Formats a date string (YYYY-MM-DD) with locale-aware formatting.
 */
export function formatDate(dateStr: string, i18n: i18n, options: FormatDateOptions = {}): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const lang = i18n.language.toUpperCase();
    const { includeWeekday = true, weekdayFormat = 'short' } = options;

    let dateOptions: Intl.DateTimeFormatOptions;

    if (lang === 'KA') {
        dateOptions = includeWeekday
            ? { weekday: weekdayFormat, day: 'numeric', month: 'long' }
            : { day: 'numeric', month: 'long' };
    } else if (lang === 'RU') {
        dateOptions = includeWeekday
            ? { weekday: weekdayFormat, day: 'numeric', month: 'long' }
            : { day: 'numeric', month: 'long' };
    } else {
        dateOptions = includeWeekday
            ? { weekday: weekdayFormat, month: 'long', day: 'numeric' }
            : { month: 'long', day: 'numeric' };
    }

    return date.toLocaleDateString(getLocale(lang), dateOptions);
}

/**
 * Formats a time range given start time and duration in minutes.
 * Returns format like "10–11:30"
 */
export function formatTimeRange(time: string, duration: number): string {
    const [h, m] = time.split(':').map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);

    const end = new Date(start.getTime() + duration * 60000);

    const formatT = (date: Date) => {
        const hours = date.getHours();
        const mins = date.getMinutes();
        return mins === 0 ? `${hours}` : `${hours}:${mins.toString().padStart(2, '0')}`;
    };

    return `${formatT(start)}–${formatT(end)}`;
}

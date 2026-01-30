import type { i18n } from 'i18next';

/**
 * Returns the locale string for Intl formatting based on language code.
 */
export function getLocale(lang: string): string {
    const upperLang = lang.toUpperCase();
    return upperLang === 'KA' ? 'ka-GE' : upperLang === 'RU' ? 'ru-RU' : 'en-US';
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

/**
 * Formats a currency amount with comma decimal separator and trimmed trailing zeros.
 * e.g. 42.50 -> "42,5", 42.00 -> "42"
 */
export function formatCurrency(amount: number): string {
    if (Number.isInteger(amount)) return String(amount);
    return Number(amount.toFixed(2)).toString().replace('.', ',');
}

import type { Group, GroupSchedule } from '../types';

/**
 * Returns a short summary of a group's schedule (e.g. "Mon 10–11, Wed 19–20:30")
 */
export function getScheduleSummary(group: Group, schedules: GroupSchedule[], t: any, i18n: i18n): string {
    const groupSchedules = schedules.filter(s => String(s.group_id) === String(group.id) && s.is_active);
    if (groupSchedules.length === 0) return t('no_schedule') || 'No schedule';

    const lang = i18n.language.toUpperCase();
    const locale = getLocale(lang);

    // Helper to format day of week
    const getDayName = (day: number) => {
        const date = new Date(2024, 0, day + 7); // Jan 7, 2024 was a Sunday
        return date.toLocaleDateString(locale, { weekday: 'short' });
    };

    return groupSchedules
        .map(s => `${getDayName(s.day_of_week)} ${formatTimeRange(s.time, s.duration_minutes || group.default_duration_minutes || 60)}`)
        .join(', ');
}

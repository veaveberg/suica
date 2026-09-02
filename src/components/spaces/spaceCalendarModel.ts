import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';

export type SpaceCalendarMode = 'month' | 'week';
export type SpaceCalendarContent = 'availability' | 'events';

export interface SpaceCalendarRange {
    endDate: string;
    startDate: string;
}

const dateKey = (date: Date) => format(date, 'yyyy-MM-dd');

export function dateFromKey(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
}

export function sourceCalendarRange(timeZone: string): SpaceCalendarRange {
    const today = todayInTimeZone(timeZone);
    return { startDate: dateKey(addDays(today, -31)), endDate: dateKey(addDays(today, 400)) };
}

// Kept while Vite clients with the prior space calendar module hot-reload.
export function calendarRange(focus: Date, mode: SpaceCalendarMode): SpaceCalendarRange {
    const start = mode === 'month' ? startOfWeek(startOfMonth(focus), { weekStartsOn: 1 }) : startOfWeek(focus, { weekStartsOn: 1 });
    const end = mode === 'month' ? endOfWeek(endOfMonth(focus), { weekStartsOn: 1 }) : endOfWeek(focus, { weekStartsOn: 1 });
    return { startDate: dateKey(start), endDate: dateKey(end) };
}

export function todayInTimeZone(timeZone: string): Date {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return dateFromKey(`${values.year}-${values.month}-${values.day}`);
}

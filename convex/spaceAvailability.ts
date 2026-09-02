export const WEEKDAY_KEYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
] as const;

export type WeekdayKey = typeof WEEKDAY_KEYS[number];
export type MinuteRange = { start: number; end: number };
export type WorkingHours = Record<WeekdayKey, MinuteRange | null>;
export type BusyInterval = { start: number; end: number };
export type AvailabilityDay = { date: string; windows: MinuteRange[] };

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateParts(dateKey: string) {
    if (!DATE_KEY_PATTERN.test(dateKey)) throw new Error("Invalid date");
    const [year, month, day] = dateKey.split("-").map(Number);
    if (!year || !month || !day) throw new Error("Invalid date");
    return { year, month, day };
}

export function addDaysToDateKey(dateKey: string, amount: number): string {
    const { year, month, day } = dateParts(dateKey);
    const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
    return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

export function addMonthsToDateKey(dateKey: string, amount: number): string {
    const { year, month, day } = dateParts(dateKey);
    const targetMonthIndex = month - 1 + amount;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const targetMonth = (targetMonthIndex % 12 + 12) % 12;
    const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return [targetYear, String(targetMonth + 1).padStart(2, "0"), String(Math.min(day, lastDayOfTargetMonth)).padStart(2, "0")].join("-");
}

export function countDateKeysInclusive(startDate: string, endDate: string): number {
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("Invalid date range");
    return Math.floor((end - start) / 86_400_000) + 1;
}

export function dateKeyInTimeZone(date: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const representedAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    return representedAsUtc - date.getTime();
}

export function localMinuteToEpochMs(dateKey: string, minute: number, timeZone: string): number {
    const { year, month, day } = dateParts(dateKey);
    const utcGuess = Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60);
    const first = utcGuess - timeZoneOffsetMs(new Date(utcGuess), timeZone);
    return utcGuess - timeZoneOffsetMs(new Date(first), timeZone);
}

function weekdayForDateKey(dateKey: string): WeekdayKey {
    const { year, month, day } = dateParts(dateKey);
    return WEEKDAY_KEYS[new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()];
}

function mergeIntervals(intervals: BusyInterval[]): BusyInterval[] {
    const sorted = [...intervals].filter(interval => interval.end > interval.start).sort((left, right) => left.start - right.start || left.end - right.end);
    const merged: BusyInterval[] = [];
    for (const interval of sorted) {
        const previous = merged[merged.length - 1];
        if (!previous || interval.start > previous.end) {
            merged.push({ ...interval });
            continue;
        }
        previous.end = Math.max(previous.end, interval.end);
    }
    return merged;
}

export function calculateAvailability(args: {
    busyIntervals: readonly BusyInterval[];
    endDate: string;
    minimumMinutes: number;
    startDate: string;
    timeZone: string;
    workingHours: WorkingHours;
}): AvailabilityDay[] {
    const dayCount = countDateKeysInclusive(args.startDate, args.endDate);
    if (!Number.isInteger(args.minimumMinutes) || args.minimumMinutes < 1) throw new Error("Invalid minimum availability");
    const days: AvailabilityDay[] = [];

    for (let index = 0; index < dayCount; index += 1) {
        const date = addDaysToDateKey(args.startDate, index);
        const working = args.workingHours[weekdayForDateKey(date)];
        if (!working) {
            days.push({ date, windows: [] });
            continue;
        }
        const workingStart = localMinuteToEpochMs(date, working.start, args.timeZone);
        const workingEnd = localMinuteToEpochMs(date, working.end, args.timeZone);
        const busy = mergeIntervals(args.busyIntervals
            .filter(interval => interval.end > workingStart && interval.start < workingEnd)
            .map(interval => ({ start: Math.max(interval.start, workingStart), end: Math.min(interval.end, workingEnd) })));
        const windows: MinuteRange[] = [];
        let cursor = workingStart;
        for (const interval of busy) {
            if (interval.start - cursor >= args.minimumMinutes * 60_000) windows.push({ start: cursor, end: interval.start });
            cursor = Math.max(cursor, interval.end);
        }
        if (workingEnd - cursor >= args.minimumMinutes * 60_000) windows.push({ start: cursor, end: workingEnd });
        days.push({ date, windows });
    }
    return days;
}

export function isWorkingHours(value: unknown): value is WorkingHours {
    if (typeof value !== "object" || value === null) return false;
    return WEEKDAY_KEYS.every(key => {
        if (!(key in value)) return false;
        const range = (value as Record<string, unknown>)[key];
        if (range === null) return true;
        if (typeof range !== "object" || range === null || !("start" in range) || !("end" in range)) return false;
        const start = (range as Record<string, unknown>).start;
        const end = (range as Record<string, unknown>).end;
        return typeof start === "number" && typeof end === "number" && Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= 1440 && end > start;
    });
}

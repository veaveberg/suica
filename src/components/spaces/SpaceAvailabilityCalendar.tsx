import { addDays, addMonths, addWeeks, differenceInCalendarDays, endOfWeek, format, startOfWeek, subMonths } from 'date-fns';
import { enUS, ka, ru, uk } from 'date-fns/locale';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AvailabilityDay, ManagedSpaceEvent, WorkingHours } from '../../space-types';
import { cn } from '../../utils/cn';
import { formatTimeRange } from '../../utils/formatting';
import { todayInTimeZone, type SpaceCalendarContent, type SpaceCalendarMode } from './spaceCalendarModel';

const HOUR_HEIGHT = 32;
const WEEK_HEADER_HEIGHT = 56;
const PIXELS_PER_MINUTE = HOUR_HEIGHT / 60;
const MONTH_PIXELS_PER_MINUTE = 0.5;
const MONTH_AVAILABILITY_PIXELS_PER_MINUTE = 0.3;
const MONTH_EVENT_TITLE_CLEARANCE_MINUTES = 30;
const MONTH_WEEK_HEADER_HEIGHT = 58;
const MONTH_WEEK_SEPARATOR_HEIGHT = 2;
const MONTH_WEEK_OVERSCAN = 3;
const MONTH_TODAY_MIN_VISIBLE_RATIO = 0.3;
const WEEKDAY_KEYS: (keyof WorkingHours)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface Props { content?: SpaceCalendarContent; days: AvailabilityDay[]; events?: ManagedSpaceEvent[]; eventColor?: string; futureAvailabilityOnly?: boolean; mode: SpaceCalendarMode; onModeChange: (mode: SpaceCalendarMode) => void; onPeriodChange?: (period: string) => void; timeZone: string; workingHours: WorkingHours; showToolbar?: boolean; }
interface MinuteRange { end: number; start: number; }
interface TimelineEventPlacement { event: ManagedSpaceEvent; column: number; columnCount: number; }
type MonthEventPlacement =
    | { kind: 'cascade'; event: ManagedSpaceEvent; offset: number; }
    | { kind: 'columns'; event: ManagedSpaceEvent; column: number; columnCount: number; };
type MonthWeekMetric = { height: number; index: number; range: MinuteRange | null; top: number; week: Date[]; };
type TimeWindow = { end: number; start: number };
type UnavailableSegment = MinuteRange & { past: boolean };

function minutesInTimeZone(timestamp: number, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return Number(values.hour) * 60 + Number(values.minute);
}

function formatWindow(start: number, end: number, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(start));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const startTime = `${values.hour}:${values.minute}`;
    return formatTimeRange(startTime, Math.max(0, Math.round((end - start) / 60000)));
}

function dateKeyInTimeZone(timestamp: number, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function timelineInterval(event: ManagedSpaceEvent, timeZone: string): MinuteRange {
    if (event.allDay) return { start: 0, end: 24 * 60 };
    const start = minutesInTimeZone(event.start, timeZone);
    const rawEnd = minutesInTimeZone(event.end, timeZone);
    return { start, end: Math.max(start + 1, rawEnd <= start ? rawEnd + 24 * 60 : rawEnd) };
}

function layoutTimelineEvents(events: ManagedSpaceEvent[], timeZone: string): TimelineEventPlacement[] {
    const placements: TimelineEventPlacement[] = [];
    let group: ManagedSpaceEvent[] = [];
    let groupEnd = -Infinity;
    const addGroup = () => {
        if (group.length === 0) return;
        const columnEnds: number[] = [];
        const groupPlacements = group.map(event => {
            const { start, end } = timelineInterval(event, timeZone);
            const reusableColumn = columnEnds.findIndex(columnEnd => columnEnd <= start);
            const column = reusableColumn === -1 ? columnEnds.length : reusableColumn;
            columnEnds[column] = end;
            return { event, column, columnCount: 0 };
        });
        placements.push(...groupPlacements.map(placement => ({ ...placement, columnCount: columnEnds.length })));
        group = [];
        groupEnd = -Infinity;
    };
    for (const event of events) {
        const { start, end } = timelineInterval(event, timeZone);
        if (group.length > 0 && start >= groupEnd) addGroup();
        group.push(event);
        groupEnd = Math.max(groupEnd, end);
    }
    addGroup();
    return placements;
}

function layoutMonthEvents(events: ManagedSpaceEvent[], timeZone: string): MonthEventPlacement[] {
    const placements: MonthEventPlacement[] = [];
    let group: ManagedSpaceEvent[] = [];
    let groupEnd = -Infinity;
    const addGroup = () => {
        if (group.length === 0) return;
        const needsColumns = group.some((event, index) => {
            const interval = timelineInterval(event, timeZone);
            return group.slice(0, index).some(previous => {
                const previousInterval = timelineInterval(previous, timeZone);
                return previousInterval.end > interval.start && interval.start - previousInterval.start < MONTH_EVENT_TITLE_CLEARANCE_MINUTES;
            });
        });
        if (needsColumns) {
            for (const placement of layoutTimelineEvents(group, timeZone)) placements.push({ kind: 'columns', event: placement.event, column: placement.column, columnCount: placement.columnCount });
        } else {
            const active: { end: number; offset: number }[] = [];
            for (const event of group) {
                const { start, end } = timelineInterval(event, timeZone);
                for (let index = active.length - 1; index >= 0; index -= 1) if (active[index].end <= start) active.splice(index, 1);
                let offset = 0;
                while (active.some(item => item.offset === offset)) offset += 1;
                active.push({ end, offset });
                placements.push({ kind: 'cascade', event, offset });
            }
        }
        group = [];
        groupEnd = -Infinity;
    };
    for (const event of events) {
        const { start, end } = timelineInterval(event, timeZone);
        if (group.length > 0 && start >= groupEnd) addGroup();
        group.push(event);
        groupEnd = Math.max(groupEnd, end);
    }
    addGroup();
    return placements;
}

function TimelineEvent({ placement, eventColor, timeZone }: { placement: TimelineEventPlacement; eventColor: string; timeZone: string }) {
    const { event, column, columnCount } = placement;
    const { start, end } = timelineInterval(event, timeZone);
    const left = (column / columnCount) * 100;
    const width = 100 / columnCount;
    return <div className="absolute z-[6] flex flex-col items-start overflow-hidden rounded-md py-1 pl-2.5 pr-1.5 text-left text-[9px] leading-tight mix-blend-multiply dark:mix-blend-screen" style={{ top: event.allDay ? 4 : start * PIXELS_PER_MINUTE, height: event.allDay ? 20 : Math.max(16, (end - start) * PIXELS_PER_MINUTE - 1), left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`, backgroundColor: `${eventColor}25`, color: eventColor }}><span className="absolute inset-y-0 left-0 w-1 rounded-l-md" style={{ backgroundColor: eventColor }} /><span className="block w-full truncate font-bold">{event.title}</span>{!event.allDay && <span className="block opacity-75">{formatWindow(event.start, event.end, timeZone)}</span>}</div>;
}

function weekWorkingRange(days: Date[], workingHours: WorkingHours): MinuteRange | null {
    const ranges = days.flatMap(day => {
        const range = workingHours[WEEKDAY_KEYS[day.getDay()]];
        return range ? [range] : [];
    });
    return ranges.length === 0 ? null : { start: Math.min(...ranges.map(range => range.start)), end: Math.max(...ranges.map(range => range.end)) };
}

function visibleMonthWeekMetrics(metrics: readonly MonthWeekMetric[], scrollTop: number, viewportHeight: number): MonthWeekMetric[] {
    const viewportBottom = scrollTop + viewportHeight;
    const firstVisible = metrics.findIndex(metric => metric.top + metric.height > scrollTop);
    if (firstVisible === -1) return [];
    let lastVisible = firstVisible;
    for (let index = metrics.length - 1; index >= firstVisible; index -= 1) {
        if (metrics[index].top < viewportBottom) {
            lastVisible = index;
            break;
        }
    }
    const start = Math.max(0, firstVisible - MONTH_WEEK_OVERSCAN);
    const end = Math.min(metrics.length, lastVisible + MONTH_WEEK_OVERSCAN + 1);
    return metrics.slice(start, end);
}

function MonthAvailabilityBlock({ past, pixelsPerMinute, window, range, timeZone }: { past: boolean; pixelsPerMinute: number; window: { end: number; start: number }; range: MinuteRange; timeZone: string }) {
    const start = minutesInTimeZone(window.start, timeZone);
    const rawEnd = minutesInTimeZone(window.end, timeZone);
    const end = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
    const visibleStart = Math.max(range.start, start);
    const visibleEnd = Math.min(range.end, end);
    if (visibleEnd <= visibleStart) return null;
    return <div className={cn('absolute left-0.5 right-0.5 z-[6] overflow-hidden rounded-md px-1 pt-0.5 text-[10px] leading-none mix-blend-multiply dark:mix-blend-screen', past ? 'bg-green-100/45 text-green-800/55 dark:bg-green-950/25 dark:text-green-200/55' : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200')} style={{ top: (visibleStart - range.start) * pixelsPerMinute + 1, height: Math.max(12, (visibleEnd - visibleStart) * pixelsPerMinute - 2) }}>{formatWindow(window.start, window.end, timeZone)}</div>;
}

function unavailableRanges({ availableWindows, timeZone, workingRange }: { availableWindows: readonly TimeWindow[]; timeZone: string; workingRange: MinuteRange }): MinuteRange[] {
    const availableRanges = availableWindows
        .map(window => {
            const start = minutesInTimeZone(window.start, timeZone);
            const rawEnd = minutesInTimeZone(window.end, timeZone);
            return { start, end: rawEnd <= start ? rawEnd + 24 * 60 : rawEnd };
        })
        .map(range => ({ start: Math.max(workingRange.start, range.start), end: Math.min(workingRange.end, range.end) }))
        .filter(range => range.end > range.start)
        .sort((left, right) => left.start - right.start);
    const unavailable: MinuteRange[] = [];
    let cursor = workingRange.start;
    for (const available of availableRanges) {
        if (available.start > cursor) unavailable.push({ start: cursor, end: available.start });
        cursor = Math.max(cursor, available.end);
    }
    if (cursor < workingRange.end) unavailable.push({ start: cursor, end: workingRange.end });
    return unavailable;
}

function unavailableSegments({ availableWindows, pastUntilMinute, timeZone, workingRange }: { availableWindows: readonly TimeWindow[]; pastUntilMinute: number; timeZone: string; workingRange: MinuteRange }): UnavailableSegment[] {
    return unavailableRanges({ availableWindows, timeZone, workingRange }).flatMap(block => {
        const pastEnd = Math.min(block.end, pastUntilMinute);
        const futureStart = Math.max(block.start, pastUntilMinute);
        return [
            ...(pastEnd > block.start ? [{ start: block.start, end: pastEnd, past: true }] : []),
            ...(block.end > futureStart ? [{ start: futureStart, end: block.end, past: false }] : []),
        ];
    });
}

function MonthUnavailableBlocks({ availableWindows, pastUntilMinute, pixelsPerMinute, range, timeZone, workingRange }: { availableWindows: readonly TimeWindow[]; pastUntilMinute: number; pixelsPerMinute: number; range: MinuteRange; timeZone: string; workingRange: MinuteRange }) {
    return <>{unavailableSegments({ availableWindows, pastUntilMinute, timeZone, workingRange }).map(block => <div key={`${block.start}-${block.end}-${block.past}`} aria-hidden="true" className={cn('pointer-events-none absolute left-0.5 right-0.5 z-[4] rounded-md', block.past ? 'bg-gray-200/55 dark:bg-zinc-700/35' : 'bg-red-100/60 dark:bg-red-950/30')} style={{ top: (block.start - range.start) * pixelsPerMinute + 1, height: Math.max(4, (block.end - block.start) * pixelsPerMinute - 2) }} />)}</>;
}

function TimelineUnavailableBlocks({ availableWindows, pastUntilMinute, timeZone, workingRange }: { availableWindows: readonly TimeWindow[]; pastUntilMinute: number; timeZone: string; workingRange: MinuteRange }) {
    return <>{unavailableSegments({ availableWindows, pastUntilMinute, timeZone, workingRange }).map(block => <div key={`${block.start}-${block.end}-${block.past}`} aria-hidden="true" className={cn('pointer-events-none absolute left-0.5 right-0.5 z-[4] rounded-md', block.past ? 'bg-gray-200/55 dark:bg-zinc-700/35' : 'bg-red-100/60 dark:bg-red-950/30')} style={{ top: block.start * PIXELS_PER_MINUTE + 1, height: Math.max(4, (block.end - block.start) * PIXELS_PER_MINUTE - 2) }} />)}</>;
}

function MonthEventBlock({ placement, pixelsPerMinute, range, eventColor, timeZone }: { placement: MonthEventPlacement; pixelsPerMinute: number; range: MinuteRange; eventColor: string; timeZone: string }) {
    const { event } = placement;
    const { start, end } = timelineInterval(event, timeZone);
    const visibleStart = Math.max(range.start, start);
    const visibleEnd = Math.min(range.end, end);
    if (visibleEnd <= visibleStart) return null;
    const horizontalPosition = placement.kind === 'columns'
        ? { left: `calc(${(placement.column / placement.columnCount) * 100}% + 2px)`, width: `calc(${100 / placement.columnCount}% - 4px)`, zIndex: 6 }
        : { left: 2 + Math.min(placement.offset, 4) * 7, right: 2, zIndex: 6 + placement.offset };
    return <div className="absolute overflow-hidden rounded-md px-1 pt-0.5 text-[10px] leading-none mix-blend-multiply dark:mix-blend-screen" style={{ top: (visibleStart - range.start) * pixelsPerMinute + 1, height: Math.max(12, (visibleEnd - visibleStart) * pixelsPerMinute - 2), backgroundColor: `${eventColor}25`, color: eventColor, ...horizontalPosition }}><span className="block truncate font-bold">{event.title}</span><span className="block opacity-75">{event.allDay ? '' : formatWindow(event.start, event.end, timeZone)}</span></div>;
}

export const SpaceAvailabilityCalendar = memo(function SpaceAvailabilityCalendar({ content = 'availability', days, events = [], eventColor = '#f472a0', futureAvailabilityOnly = false, mode, onModeChange, onPeriodChange, timeZone, workingHours, showToolbar = true }: Props) {
    const { i18n, t } = useTranslation();
    const monthRef = useRef<HTMLDivElement>(null);
    const weekRef = useRef<HTMLDivElement>(null);
    const [weekCount, setWeekCount] = useState(104);
    const [currentTime, setCurrentTime] = useState(() => new Date());
    const [monthScrollTop, setMonthScrollTop] = useState(0);
    const [monthViewportHeight, setMonthViewportHeight] = useState(0);
    const [monthToday, setMonthToday] = useState<{ direction: 'up' | 'down'; visible: boolean }>({ direction: 'up', visible: false });
    const [weekToday, setWeekToday] = useState<{ direction: 'left' | 'right'; visible: boolean }>({ direction: 'right', visible: false });
    const locale = useMemo(() => {
        const language = i18n.language.toUpperCase();
        if (language === 'RU') return ru;
        if (language === 'KA') return ka;
        if (language === 'UK') return uk;
        return enUS;
    }, [i18n.language]);
    const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
    const todayKey = format(today, 'yyyy-MM-dd');
    const currentMinutes = minutesInTimeZone(currentTime.getTime(), timeZone);
    const monthPixelsPerMinute = content === 'availability' ? MONTH_AVAILABILITY_PIXELS_PER_MINUTE : MONTH_PIXELS_PER_MINUTE;
    const calendarBounds = useMemo(() => {
        const publicRangeStart = addDays(today, -7);
        const publicRangeEnd = addMonths(today, 2);
        const publicScrollableEnd = endOfWeek(addWeeks(publicRangeEnd, 2), { weekStartsOn: 1 });
        const monthStart = startOfWeek(futureAvailabilityOnly ? publicRangeStart : subMonths(today, 6), { weekStartsOn: 1 });
        const weekStart = startOfWeek(futureAvailabilityOnly ? publicRangeStart : addWeeks(today, -26), { weekStartsOn: 1 });
        return {
            monthDayCount: futureAvailabilityOnly ? differenceInCalendarDays(publicScrollableEnd, monthStart) + 1 : weekCount * 7,
            monthStart,
            publicRangeEndKey: format(publicRangeEnd, 'yyyy-MM-dd'),
            publicRangeStartKey: format(publicRangeStart, 'yyyy-MM-dd'),
            weekDayCount: futureAvailabilityOnly ? differenceInCalendarDays(publicScrollableEnd, weekStart) + 1 : 53 * 7,
            weekStart,
        };
    }, [futureAvailabilityOnly, today, weekCount]);
    const { monthDayCount, monthStart, publicRangeEndKey, publicRangeStartKey, weekDayCount, weekStart } = calendarBounds;
    const monthDays = useMemo(() => Array.from({ length: monthDayCount }, (_, index) => addDays(monthStart, index)), [monthDayCount, monthStart]);
    const monthWeeks = useMemo(() => Array.from({ length: monthDays.length / 7 }, (_, index) => monthDays.slice(index * 7, index * 7 + 7)), [monthDays]);
    const monthWeekMetrics = useMemo(() => {
        let top = 0;
        return monthWeeks.map((week, index) => {
            const range = weekWorkingRange(week, workingHours);
            const height = MONTH_WEEK_HEADER_HEIGHT + (range ? (range.end - range.start) * monthPixelsPerMinute : 0) + (index === monthWeeks.length - 1 ? 0 : MONTH_WEEK_SEPARATOR_HEIGHT);
            const metric = { week, index, range, top, height };
            top += height;
            return metric;
        });
    }, [monthPixelsPerMinute, monthWeeks, workingHours]);
    const monthContentHeight = monthWeekMetrics.reduce((height, metric) => height + metric.height, 0);
    const visibleMonthWeeks = visibleMonthWeekMetrics(monthWeekMetrics, monthScrollTop, monthViewportHeight);
    const todayMonthWeekIndex = monthWeekMetrics.findIndex(metric => metric.week.some(day => format(day, 'yyyy-MM-dd') === todayKey));
    const weekDays = useMemo(() => Array.from({ length: weekDayCount }, (_, index) => addDays(weekStart, index)), [weekDayCount, weekStart]);
    const hours = useMemo(() => Array.from({ length: 24 }, (_, hour) => hour), []);
    const windowsByDate = useMemo(() => new Map(days.map(day => [day.date, day.windows])), [days]);
    const eventsByDate = useMemo(() => {
        const result = new Map<string, ManagedSpaceEvent[]>();
        for (const event of events) {
            const dateKey = dateKeyInTimeZone(event.start, timeZone);
            const dayEvents = result.get(dateKey) ?? [];
            dayEvents.push(event);
            result.set(dateKey, dayEvents);
        }
        for (const dayEvents of result.values()) dayEvents.sort((left, right) => left.start - right.start || left.end - right.end || left.title.localeCompare(right.title));
        return result;
    }, [events, timeZone]);
    const monthEventsByDate = useMemo(() => new Map([...eventsByDate].map(([dateKey, dayEvents]) => [dateKey, layoutMonthEvents(dayEvents, timeZone)])), [eventsByDate, timeZone]);
    const timelineEventsByDate = useMemo(() => new Map([...eventsByDate].map(([dateKey, dayEvents]) => [dateKey, layoutTimelineEvents(dayEvents, timeZone)])), [eventsByDate, timeZone]);
    const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => format(addDays(new Date(2024, 0, 1), index), 'EEEEEE', { locale })), [locale]);

    useEffect(() => {
        onPeriodChange?.(format(today, 'LLLL yyyy', { locale }));
    }, [locale, onPeriodChange, today]);

    useEffect(() => {
        const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (mode !== 'month' || todayMonthWeekIndex === -1) return;
        const container = monthRef.current;
        const todayMetric = monthWeekMetrics[todayMonthWeekIndex];
        if (!container || !todayMetric) return;
        const top = Math.max(0, todayMetric.top - container.clientHeight * 0.4);
        container.scrollTo({ top });
        setMonthScrollTop(top);
        setMonthViewportHeight(container.clientHeight);
    }, [mode, monthWeekMetrics, todayMonthWeekIndex]);

    useEffect(() => {
        if (mode !== 'month') return;
        const container = monthRef.current;
        if (!container) return;
        const update = () => {
            const scrollTop = container.scrollTop;
            setMonthScrollTop(scrollTop);
            setMonthViewportHeight(container.clientHeight);
            const todayMetric = todayMonthWeekIndex === -1 ? undefined : monthWeekMetrics[todayMonthWeekIndex];
            if (todayMetric) {
                const visibleHeight = Math.max(0, Math.min(todayMetric.top + todayMetric.height, scrollTop + container.clientHeight) - Math.max(todayMetric.top, scrollTop + MONTH_WEEK_HEADER_HEIGHT));
                const visible = visibleHeight / todayMetric.height >= MONTH_TODAY_MIN_VISIBLE_RATIO;
                const direction = todayMetric.top < scrollTop ? 'up' : 'down';
                const next: { direction: 'up' | 'down'; visible: boolean } = { direction, visible: !visible };
                setMonthToday(previous => previous.visible === next.visible && previous.direction === next.direction ? previous : next);
            }
            const containerRect = container.getBoundingClientRect();
            const monthVisibility = new Map<string, number>();
            container.querySelectorAll<HTMLElement>('[data-space-date]').forEach(cell => {
                const rect = cell.getBoundingClientRect();
                const visibleHeight = Math.max(0, Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top + 32));
                if (visibleHeight === 0) return;
                const period = format(new Date(`${cell.dataset.spaceDate}T12:00:00`), 'LLLL yyyy', { locale });
                monthVisibility.set(period, (monthVisibility.get(period) ?? 0) + visibleHeight * rect.width);
            });
            const period = [...monthVisibility.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
            if (period) onPeriodChange?.(period);
        };
        container.addEventListener('scroll', update, { passive: true });
        update();
        return () => container.removeEventListener('scroll', update);
    }, [locale, mode, monthWeekMetrics, onPeriodChange, todayMonthWeekIndex]);

    useEffect(() => {
        if (mode !== 'week') return;
        const timeline = weekRef.current;
        const current = timeline?.querySelector<HTMLElement>('[data-space-today="true"]');
        if (!timeline || !current) return;
        const scrollToToday = () => timeline.scrollTo({ left: Math.max(0, current.offsetLeft - (timeline.clientWidth - current.clientWidth) / 2), top: Math.max(0, WEEK_HEADER_HEIGHT + minutesInTimeZone(currentTime.getTime(), timeZone) * PIXELS_PER_MINUTE - timeline.clientHeight * 0.4), behavior: 'auto' });
        const updateDirection = () => {
            const timelineRect = timeline.getBoundingClientRect();
            const currentRect = current.getBoundingClientRect();
            const direction = currentRect.right < timelineRect.left ? 'left' : currentRect.left > timelineRect.right ? 'right' : null;
            setWeekToday(previous => direction ? { direction, visible: true } : { ...previous, visible: false });
        };
        scrollToToday();
        updateDirection();
        timeline.addEventListener('scroll', updateDirection, { passive: true });
        return () => timeline.removeEventListener('scroll', updateDirection);
    }, [currentTime, mode, timeZone]);

    const jumpToToday = () => {
        if (mode === 'month') {
            const container = monthRef.current;
            const todayMetric = todayMonthWeekIndex === -1 ? undefined : monthWeekMetrics[todayMonthWeekIndex];
            if (container && todayMetric) container.scrollTo({ top: Math.max(0, todayMetric.top - container.clientHeight * 0.4), behavior: 'smooth' });
            return;
        }
        const timeline = weekRef.current;
        const current = timeline?.querySelector<HTMLElement>('[data-space-today="true"]');
        if (timeline && current) timeline.scrollTo({ left: Math.max(0, current.offsetLeft - (timeline.clientWidth - current.clientWidth) / 2), top: Math.max(0, WEEK_HEADER_HEIGHT + minutesInTimeZone(currentTime.getTime(), timeZone) * PIXELS_PER_MINUTE - timeline.clientHeight * 0.4), behavior: 'smooth' });
    };

    return <div className="relative flex h-full min-h-0 flex-col bg-ios-background dark:bg-black">
        {showToolbar && <div className="shrink-0 border-b border-gray-200 bg-ios-card/85 px-4 py-3 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/85"><div className="flex w-fit rounded-xl bg-ios-background p-1 text-xs font-semibold dark:bg-zinc-800"><button type="button" onClick={() => onModeChange('month')} className={mode === 'month' ? 'rounded-lg bg-white px-3 py-1.5 text-ios-blue shadow-sm dark:bg-zinc-700' : 'px-3 py-1.5 text-ios-gray'}>{t('month')}</button><button type="button" onClick={() => onModeChange('week')} className={mode === 'week' ? 'rounded-lg bg-white px-3 py-1.5 text-ios-blue shadow-sm dark:bg-zinc-700' : 'px-3 py-1.5 text-ios-gray'}>{t('week')}</button></div></div>}
        {mode === 'month' ? <div ref={monthRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-32 hide-scrollbar">
            <div className="sticky top-0 z-10 grid grid-cols-7 bg-ios-background dark:bg-black">{weekdays.map(day => <div key={day} className="py-2 pl-3 text-[10px] font-black uppercase tracking-widest text-ios-gray">{day}</div>)}</div>
            <div className="relative" style={{ height: monthContentHeight }}>{visibleMonthWeeks.map(({ height: weekHeight, index: weekIndex, range, top, week }) => {
                const isCurrentWeek = week.some(day => format(day, 'yyyy-MM-dd') === todayKey);
                const showCurrentTime = isCurrentWeek && range !== null && currentMinutes >= range.start && currentMinutes <= range.end;
                return <div key={format(week[0], 'yyyy-MM-dd')} className={cn('absolute inset-x-0 grid grid-cols-7', weekIndex !== monthWeeks.length - 1 && 'border-b-2 border-gray-300 dark:border-zinc-600')} style={{ top, height: weekHeight }}>{week.map((day, dayIndex) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const firstOfMonth = day.getDate() === 1;
                    const isToday = key === todayKey;
                    const workingRange = workingHours[WEEKDAY_KEYS[day.getDay()]];
                    const availableWindows = windowsByDate.get(key);
                    const pastUntilMinute = key < todayKey ? Infinity : isToday ? currentMinutes : -Infinity;
                    const outsidePublicRange = futureAvailabilityOnly && (key < publicRangeStartKey || key > publicRangeEndKey);
                    const height = range ? (range.end - range.start) * monthPixelsPerMinute : 0;
                    return <div key={key} data-space-date={key} data-space-today={isToday || undefined} className={cn('p-1', outsidePublicRange ? 'bg-gray-100 dark:bg-zinc-800' : 'bg-white dark:bg-zinc-900', dayIndex !== 6 && 'border-r border-gray-200 dark:border-zinc-800')} style={{ boxShadow: firstOfMonth ? 'inset 0 2px 0 rgb(113 113 122)' : undefined }}><div className="h-[50px]">{firstOfMonth && <div className="text-sm font-black uppercase leading-tight dark:text-white">{format(day, 'MMM', { locale })}</div>}<div className={cn('mb-1 text-xs font-bold', isToday ? 'flex h-7 w-7 items-center justify-center rounded-full bg-ios-red text-white' : 'text-ios-gray')}>{format(day, 'd')}</div></div><div className="relative -mx-1" style={{ height }}>{range && hours.filter(hour => hour * 60 >= range.start && hour * 60 < range.end).map(hour => <div key={hour} aria-hidden="true" className="pointer-events-none absolute left-0 right-0 z-[5] border-t border-gray-200 dark:border-zinc-800" style={{ top: (hour * 60 - range.start) * monthPixelsPerMinute }} />)}{content === 'availability' && range && workingRange && availableWindows && <MonthUnavailableBlocks availableWindows={availableWindows} pastUntilMinute={pastUntilMinute} pixelsPerMinute={monthPixelsPerMinute} range={range} timeZone={timeZone} workingRange={workingRange} />}{showCurrentTime && range && <div className={cn('pointer-events-none absolute left-0 right-0 z-10', isToday ? 'h-0.5 bg-ios-red' : 'h-px')} style={{ top: (currentMinutes - range.start) * monthPixelsPerMinute, backgroundColor: isToday ? undefined : 'rgb(255 59 48 / 0.45)' }}>{isToday && <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-ios-red" />}</div>}{range && (content === 'availability' ? (availableWindows ?? []).map(window => <MonthAvailabilityBlock key={window.start} past={window.end <= currentTime.getTime()} pixelsPerMinute={monthPixelsPerMinute} window={window} range={range} timeZone={timeZone} />) : (monthEventsByDate.get(key) ?? []).map((placement, index) => <MonthEventBlock key={`${placement.event.start}-${placement.event.end}-${placement.event.title}-${index}`} placement={placement} pixelsPerMinute={monthPixelsPerMinute} range={range} eventColor={eventColor} timeZone={timeZone} />))}</div></div>;
                })}</div>;
            })}</div>
            {!futureAvailabilityOnly && <div className="flex justify-center p-8"><button type="button" onClick={() => setWeekCount(value => value + 52)} className="rounded-2xl border border-gray-200 bg-ios-card px-7 py-3 font-semibold text-ios-blue dark:border-zinc-800 dark:bg-zinc-900">{t('load_more')}</button></div>}
        </div> : <div ref={weekRef} className="min-h-0 flex-1 overflow-auto overscroll-x-contain snap-x snap-mandatory"><div className="flex min-h-full w-max"><aside className="sticky left-0 z-20 w-11 shrink-0 bg-ios-background dark:bg-black"><div className="h-14" />{hours.map(hour => <div key={hour} className="relative h-8"><span className="absolute right-1.5 top-0 -translate-y-1/2 text-right text-[9px] leading-none text-ios-gray">{hour}:00</span></div>)}</aside>{weekDays.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const isToday = key === todayKey;
            const workingRange = workingHours[WEEKDAY_KEYS[day.getDay()]];
            const availableWindows = windowsByDate.get(key);
            const pastUntilMinute = key < todayKey ? Infinity : isToday ? currentMinutes : -Infinity;
            const outsidePublicRange = futureAvailabilityOnly && (key < publicRangeStartKey || key > publicRangeEndKey);
            if (content === 'events') return <section key={key} data-space-today={isToday || undefined} className="w-28 shrink-0 snap-start border-r border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 sm:w-32"><header className="sticky top-0 z-10 h-14 border-b border-gray-200 bg-ios-card px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900"><div className="text-[9px] font-black uppercase text-ios-gray">{format(day, 'EEEE', { locale })}</div><div className={cn('mt-0.5 text-base font-bold', isToday ? 'flex h-6 w-6 items-center justify-center rounded-full bg-ios-red text-white' : 'dark:text-white')}>{format(day, 'd')}</div></header><div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>{hours.map(hour => <div key={hour} aria-hidden="true" className="pointer-events-none absolute left-0 right-0 z-[5] border-t border-gray-200 dark:border-zinc-800" style={{ top: hour * HOUR_HEIGHT }} />)}{(timelineEventsByDate.get(key) ?? []).map((placement, index) => <TimelineEvent key={`${placement.event.start}-${placement.event.end}-${placement.event.title}-${index}`} placement={placement} eventColor={eventColor} timeZone={timeZone} />)}<div className={cn('pointer-events-none absolute left-0 right-0 z-10', isToday ? 'h-0.5 bg-ios-red' : 'h-px')} style={{ top: minutesInTimeZone(currentTime.getTime(), timeZone) * PIXELS_PER_MINUTE, backgroundColor: isToday ? undefined : 'rgb(255 59 48 / 0.45)' }}>{isToday && <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-ios-red" />}</div></div></section>;
            return <section key={key} data-space-today={isToday || undefined} className={cn('w-28 shrink-0 snap-start border-r border-gray-200 dark:border-zinc-800 sm:w-32', outsidePublicRange ? 'bg-gray-100 dark:bg-zinc-800' : 'bg-white dark:bg-zinc-900')}><header className="sticky top-0 z-10 h-14 border-b border-gray-200 bg-ios-card px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900"><div className="text-[9px] font-black uppercase text-ios-gray">{format(day, 'EEEE', { locale })}</div><div className={cn('mt-0.5 text-base font-bold', isToday ? 'flex h-6 w-6 items-center justify-center rounded-full bg-ios-red text-white' : 'dark:text-white')}>{format(day, 'd')}</div></header><div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>{hours.map(hour => <div key={hour} aria-hidden="true" className="pointer-events-none absolute left-0 right-0 z-[5] border-t border-gray-200 dark:border-zinc-800" style={{ top: hour * HOUR_HEIGHT }} />)}{workingRange && availableWindows && <TimelineUnavailableBlocks availableWindows={availableWindows} pastUntilMinute={pastUntilMinute} timeZone={timeZone} workingRange={workingRange} />}{(availableWindows ?? []).map(window => {
                const start = minutesInTimeZone(window.start, timeZone);
                const rawEnd = minutesInTimeZone(window.end, timeZone);
                const end = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
                const past = window.end <= currentTime.getTime();
                return <div key={window.start} className={cn('absolute left-0.5 right-0.5 z-[6] overflow-hidden rounded-md border px-1 py-0.5 text-[9px] leading-tight mix-blend-multiply dark:mix-blend-screen', past ? 'border-green-500/35 bg-green-100/45 text-green-800/55 dark:border-green-400/30 dark:bg-green-950/25 dark:text-green-200/55' : 'border-green-500 bg-green-100 text-green-800 dark:border-green-400 dark:bg-green-950 dark:text-green-200')} style={{ top: start * PIXELS_PER_MINUTE, height: Math.max(16, (end - start) * PIXELS_PER_MINUTE - 1) }}>{formatWindow(window.start, window.end, timeZone)}</div>;
            })}<div className={cn('pointer-events-none absolute left-0 right-0 z-10', isToday ? 'h-0.5 bg-ios-red' : 'h-px')} style={{ top: minutesInTimeZone(currentTime.getTime(), timeZone) * PIXELS_PER_MINUTE, backgroundColor: isToday ? undefined : 'rgb(255 59 48 / 0.45)' }}>{isToday && <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-ios-red" />}</div></div></section>;
        })}</div></div>}
        <button type="button" onClick={jumpToToday} aria-label={t('today')} className={cn('fixed bottom-32 right-[1.375rem] z-50 flex h-12 w-12 items-center justify-center rounded-full bg-ios-red text-white shadow-lg transition-all duration-400 active:scale-90', (mode === 'week' ? weekToday.visible : monthToday.visible) ? 'opacity-100 scale-100 translate-y-0' : 'pointer-events-none translate-y-4 scale-90 opacity-0')}>{mode === 'week' ? weekToday.direction === 'left' ? <ArrowLeft className="h-6 w-6" /> : <ArrowRight className="h-6 w-6" /> : monthToday.direction === 'up' ? <ArrowUp className="h-6 w-6" /> : <ArrowDown className="h-6 w-6" />}</button>
        <style>{'.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { scrollbar-width: none; }'}</style>
    </div>;
});

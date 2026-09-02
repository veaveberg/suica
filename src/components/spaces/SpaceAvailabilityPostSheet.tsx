import { ArrowLeft, ArrowRight, Copy, X } from 'lucide-react';
import { addDays, addWeeks, startOfWeek } from 'date-fns';
import type { TFunction } from 'i18next';
import { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { AvailabilityDay, WorkingHours } from '../../space-types';
import { formatTimeRange, getLocale } from '../../utils/formatting';
import { todayInTimeZone } from './spaceCalendarModel';

interface Props {
    days: AvailabilityDay[];
    onClose: () => void;
    timeZone: string;
    workingHours: WorkingHours;
}

const WEEKDAY_KEYS: (keyof WorkingHours)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function timeInTimeZone(timestamp: number, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.hour}:${values.minute}`;
}

function formatDay(date: Date, locale: string): string {
    return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric' }).format(date);
}

function formatWeekRange(start: Date, end: Date): string {
    const startDay = String(start.getDate()).padStart(2, '0');
    const endDay = String(end.getDate()).padStart(2, '0');
    const startMonth = String(start.getMonth() + 1).padStart(2, '0');
    const endMonth = String(end.getMonth() + 1).padStart(2, '0');
    return startMonth === endMonth ? `${startDay}–${endDay}.${endMonth}` : `${startDay}.${startMonth}–${endDay}.${endMonth}`;
}

function selectedWeekStart(timeZone: string, weekOffset: number): Date {
    return addWeeks(startOfWeek(todayInTimeZone(timeZone), { weekStartsOn: 1 }), weekOffset);
}

function windowsCoverWorkingHours({ day, timeZone, windows, workingHours }: { day: Date; timeZone: string; windows: AvailabilityDay['windows']; workingHours: WorkingHours }): boolean {
    const workingRange = workingHours[WEEKDAY_KEYS[day.getDay()]];
    if (!workingRange) return false;
    const intervals = windows.map(window => {
        const start = Number(timeInTimeZone(window.start, timeZone).split(':')[0]) * 60 + Number(timeInTimeZone(window.start, timeZone).split(':')[1]);
        const rawEnd = Number(timeInTimeZone(window.end, timeZone).split(':')[0]) * 60 + Number(timeInTimeZone(window.end, timeZone).split(':')[1]);
        return { start, end: rawEnd <= start ? rawEnd + 24 * 60 : rawEnd };
    }).sort((left, right) => left.start - right.start);
    let coveredUntil = workingRange.start;
    for (const interval of intervals) {
        if (interval.start > coveredUntil) break;
        coveredUntil = Math.max(coveredUntil, interval.end);
        if (coveredUntil >= workingRange.end) return true;
    }
    return false;
}

function createPost({ days, locale, onlyFuture, t, timeZone, weekOffset, workingHours }: { days: AvailabilityDay[]; locale: string; onlyFuture: boolean; t: TFunction; timeZone: string; weekOffset: number; workingHours: WorkingHours }): string {
    const weekStart = selectedWeekStart(timeZone, weekOffset);
    const now = Date.now();
    const availabilityByDate = new Map(days.map(day => [day.date, day.windows]));
    const daySections = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).flatMap(day => {
        const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        const windows = (availabilityByDate.get(key) ?? []).flatMap(window => !onlyFuture || window.end > now ? [{ ...window, start: Math.max(window.start, now) }] : []);
        if (windows.length === 0) return [];
        const times = windowsCoverWorkingHours({ day, timeZone, windows, workingHours }) ? [t('all_day')] : windows.map(window => formatTimeRange(timeInTimeZone(window.start, timeZone), Math.round((window.end - window.start) / 60_000)));
        return [`${formatDay(day, locale)}\n${times.join('\n')}`];
    });
    const intro = `${formatWeekRange(weekStart, addDays(weekStart, 6))}\n${t('space_post_heading')}\n${t('space_post_booking')}`;
    return daySections.length > 0 ? `${intro}\n\n${daySections.join('\n\n')}` : `${intro}\n\n${t('space_post_empty')}`;
}

export function SpaceAvailabilityPostSheet({ days, onClose, timeZone, workingHours }: Props) {
    const { t, i18n } = useTranslation();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [weekOffset, setWeekOffset] = useState(0);
    const [onlyFuture, setOnlyFuture] = useState(true);
    const locale = getLocale(i18n.language);
    const [draft, setDraft] = useState(() => createPost({ days, locale, onlyFuture: true, t, timeZone, weekOffset: 0, workingHours }));
    const [copied, setCopied] = useState(false);
    const weekStart = useMemo(() => selectedWeekStart(timeZone, weekOffset), [timeZone, weekOffset]);

    useEffect(() => { dialogRef.current?.showModal(); }, []);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(draft);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setCopied(false);
        }
    };
    const changeWeek = (nextOffset: number) => {
        setWeekOffset(nextOffset);
        setDraft(createPost({ days, locale, onlyFuture, t, timeZone, weekOffset: nextOffset, workingHours }));
    };
    const changeOnlyFuture = (nextOnlyFuture: boolean) => {
        setOnlyFuture(nextOnlyFuture);
        setDraft(createPost({ days, locale, onlyFuture: nextOnlyFuture, t, timeZone, weekOffset, workingHours }));
    };
    const weekLabel = `${weekOffset === 0 ? `${t('current_week')} ` : ''}${formatWeekRange(weekStart, addDays(weekStart, 6))}`;

    return <dialog ref={dialogRef} onCancel={onClose} aria-labelledby="space-post-title" className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl bg-ios-card p-5 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:bg-zinc-900 dark:text-white">
        <div className="flex items-start justify-between gap-3">
            <h2 id="space-post-title" className="text-lg font-bold">{t('space_post_title')}</h2>
            <button type="button" onClick={onClose} aria-label={t('close')} className="rounded-full p-2 text-ios-gray"><X size={20} /></button>
        </div>
        <div className="mx-auto mt-4 grid w-64 grid-cols-[2rem_1fr_2rem] items-center text-xs font-medium text-ios-gray"><button type="button" onClick={() => changeWeek(weekOffset - 1)} aria-label={t('previous_week')} className="justify-self-center rounded-lg p-1.5 active:bg-ios-background dark:active:bg-zinc-800"><ArrowLeft size={15} /></button><span className="truncate text-center">{weekLabel}</span><button type="button" onClick={() => changeWeek(weekOffset + 1)} aria-label={t('next_week_action')} className="justify-self-center rounded-lg p-1.5 active:bg-ios-background dark:active:bg-zinc-800"><ArrowRight size={15} /></button></div>
        <label className="mt-4 flex items-center gap-2 text-sm text-ios-gray"><input type="checkbox" checked={onlyFuture} onChange={event => changeOnlyFuture(event.target.checked)} className="h-4 w-4 accent-ios-blue" />{t('space_post_only_future')}</label>
        <textarea value={draft} onChange={event => setDraft(event.target.value)} aria-label={t('space_post_title')} rows={16} className="mt-5 w-full resize-y rounded-xl border border-gray-200 bg-ios-background p-3 font-mono text-sm leading-6 text-zinc-900 outline-none focus:border-ios-blue dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-ios-gray">{t('close')}</button><button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-xl bg-ios-blue px-4 py-2 text-sm font-semibold text-white"><Copy size={16} />{copied ? t('copied') : t('copy_text')}</button></div>
    </dialog>;
}

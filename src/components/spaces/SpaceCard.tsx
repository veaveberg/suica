import { ChevronRight, Pencil, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ManagedSpace, WeekdayKey } from '../../space-types';
import { setParams } from '../../hooks/useSearchParams';
import { SpaceHoursSheet } from './SpaceHoursSheet';
import { shareSpaceAvailability } from './spaceLinks';
import { formatTimeRange } from '../../utils/formatting';

const DAY_ORDER: WeekdayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function formatHours(space: ManagedSpace, locale: string): string {
    const labels = DAY_ORDER.map((key, index) => ({
        key,
        index,
        label: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 8 + index)),
        range: space.workingHours[key],
    }));
    const open = labels.flatMap(day => day.range ? [{ ...day, range: day.range }] : []);
    if (open.length === 0) return '';
    const firstRange = open[0].range;
    const sameRange = firstRange !== null && open.every(day => day.range?.start === firstRange.start && day.range.end === firstRange.end);
    const contiguousDays = open.every((day, index) => index === 0 || day.index === open[index - 1].index + 1);
    if (sameRange && firstRange && contiguousDays) {
        const dayLabel = open.length === 1 ? open[0].label : `${open[0].label}–${open[open.length - 1].label}`;
        return `${dayLabel} ${formatTimeRange(minutesToTime(firstRange.start), firstRange.end - firstRange.start)}`;
    }
    return open.map(day => `${day.label} ${formatTimeRange(minutesToTime(day.range.start), day.range.end - day.range.start)}`).join(', ');
}

function minutesToTime(minutes: number): string {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function SpaceCard({ space }: { space: ManagedSpace }) {
    const { t, i18n } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [shared, setShared] = useState(false);
    const openCalendar = () => setParams({ tab: 'calendar', calendar: `space:${space.slug}`, view: 'week' });
    const share = async () => {
        try {
            await shareSpaceAvailability(space);
            setShared(true);
            window.setTimeout(() => setShared(false), 1800);
        } catch {
            setShared(false);
        }
    };

    return <>
        <article className="w-full flex items-center justify-between gap-3 p-4 ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl">
            <button type="button" onClick={openCalendar} className="flex min-w-0 flex-1 items-start text-left active:scale-[0.98] transition-transform">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: space.color }} />
                        <h3 className="text-xl font-bold dark:text-white leading-none truncate">{space.name}</h3>
                    </div>
                    <p className="text-sm text-ios-gray pl-7 truncate">{formatHours(space, i18n.language) || t('space_closed')}</p>
                    {(space.syncState === 'pending' || space.syncState === 'syncing') && <p className="text-xs text-ios-blue pl-7 mt-1 truncate">{t('space_updating')}</p>}
                    {space.syncState === 'error' && <p className="text-xs text-ios-red pl-7 mt-1 truncate">{t('space_calendar_unavailable')}</p>}
                </div>
            </button>
            <div className="flex items-center gap-1">
                <button type="button" onClick={() => setEditing(true)} aria-label={t('space_edit_hours')} className="rounded-lg p-2 text-ios-gray active:bg-ios-background dark:active:bg-zinc-800"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={share} aria-label={shared ? t('copied') : t('space_share_availability')} className="rounded-lg p-2 text-ios-gray active:bg-ios-background dark:active:bg-zinc-800"><Share2 className="h-4 w-4" /></button>
                <button type="button" onClick={openCalendar} aria-label={t('space_open_calendar')} className="rounded-lg p-1 text-ios-gray"><ChevronRight className="h-5 w-5" /></button>
            </div>
        </article>
        {editing && <SpaceHoursSheet space={space} onClose={() => setEditing(false)} />}
    </>;
}

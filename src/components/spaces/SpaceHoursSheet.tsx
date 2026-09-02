import { Copy, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ManagedSpace, WeekdayKey, WorkingHours } from '../../space-types';
import { updateSpaceWorkingHours } from '../../db-server';

const DAYS: { key: WeekdayKey; date: Date }[] = [
    { key: 'monday', date: new Date(2024, 0, 8) },
    { key: 'tuesday', date: new Date(2024, 0, 9) },
    { key: 'wednesday', date: new Date(2024, 0, 10) },
    { key: 'thursday', date: new Date(2024, 0, 11) },
    { key: 'friday', date: new Date(2024, 0, 12) },
    { key: 'saturday', date: new Date(2024, 0, 13) },
    { key: 'sunday', date: new Date(2024, 0, 14) },
];

const timeValue = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const parseTime = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
};

export function SpaceHoursSheet({ space, onClose }: { space: ManagedSpace; onClose: () => void }) {
    const { t, i18n } = useTranslation();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [draft, setDraft] = useState<WorkingHours>(space.workingHours);
    const [copyFrom, setCopyFrom] = useState<WeekdayKey | null>(null);
    const [copyTargets, setCopyTargets] = useState<Set<WeekdayKey>>(new Set());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { dialogRef.current?.showModal(); }, []);
    const labels = useMemo(() => new Map(DAYS.map(day => [day.key, new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(day.date)])), [i18n.language]);
    const valid = DAYS.every(({ key }) => {
        const range = draft[key];
        return range === null || range.end > range.start;
    });
    const inputClass = 'w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white disabled:opacity-40 sm:w-24';

    const updateDay = (key: WeekdayKey, range: WorkingHours[WeekdayKey]) => setDraft(previous => ({ ...previous, [key]: range }));
    const startCopy = (key: WeekdayKey) => {
        setCopyFrom(key);
        setCopyTargets(new Set(DAYS.map(day => day.key).filter(dayKey => dayKey !== key)));
    };
    const applyCopy = () => {
        if (!copyFrom) return;
        const source = draft[copyFrom];
        setDraft(previous => {
            let next = { ...previous };
            for (const { key } of DAYS) if (copyTargets.has(key)) next = { ...next, [key]: source };
            return next;
        });
        setCopyFrom(null);
    };

    return <dialog ref={dialogRef} onCancel={onClose} aria-labelledby="space-hours-title" className="m-auto w-[calc(100%-2rem)] max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-ios-card p-5 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:bg-zinc-900 dark:text-white">
        <form onSubmit={async event => {
            event.preventDefault();
            if (!valid || saving) return;
            setSaving(true);
            setError('');
            try {
                await updateSpaceWorkingHours(space.id, draft);
                onClose();
            } catch {
                setError(t('space_hours_save_error'));
            } finally {
                setSaving(false);
            }
        }}>
            <div className="flex items-center justify-between gap-3">
                <div><h2 id="space-hours-title" className="text-lg font-bold">{t('space_working_hours')}</h2><p className="mt-1 text-sm text-ios-gray">{space.name} · {space.timeZone}</p></div>
                <button type="button" onClick={onClose} aria-label={t('close')} className="rounded-full p-2 text-ios-gray"><X size={20} /></button>
            </div>
            <div className="mt-5 space-y-2">{DAYS.map(({ key }) => {
                const range = draft[key];
                return <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl bg-ios-background px-3 py-2 dark:bg-zinc-800 sm:grid-cols-[minmax(7rem,1fr)_auto_auto_auto_auto]">
                    <label className="col-span-2 col-start-1 row-start-1 flex min-w-0 items-center gap-2 text-sm font-medium sm:col-span-1"><input type="checkbox" checked={range !== null} onChange={event => updateDay(key, event.target.checked ? { start: 9 * 60, end: 18 * 60 } : null)} className="accent-blue-500" />{labels.get(key)}</label>
                    <input type="time" disabled={!range} value={range ? timeValue(range.start) : '09:00'} onChange={event => range && updateDay(key, { ...range, start: parseTime(event.target.value) })} aria-label={`${labels.get(key)} ${t('start')}`} className={`${inputClass} col-start-1 row-start-2 sm:col-start-2 sm:row-start-1`} />
                    <span className="col-start-2 row-start-2 text-ios-gray sm:col-start-3 sm:row-start-1">–</span>
                    <input type="time" disabled={!range} value={range ? timeValue(range.end) : '18:00'} onChange={event => range && updateDay(key, { ...range, end: parseTime(event.target.value) })} aria-label={`${labels.get(key)} ${t('end')}`} className={`${inputClass} col-start-3 row-start-2 sm:col-start-4 sm:row-start-1`} />
                    <button type="button" onClick={() => startCopy(key)} aria-label={t('space_copy_hours', { day: labels.get(key) })} className="col-start-3 row-start-1 justify-self-end rounded-lg p-2 text-ios-blue sm:col-start-5"><Copy size={18} /></button>
                </div>;
            })}</div>
            {copyFrom && <div className="mt-4 rounded-xl border border-gray-200 p-3 dark:border-zinc-700">
                <p className="text-sm font-semibold">{t('space_copy_to_days')}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">{DAYS.filter(day => day.key !== copyFrom).map(({ key }) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={copyTargets.has(key)} onChange={event => setCopyTargets(previous => { const next = new Set(previous); if (event.target.checked) next.add(key); else next.delete(key); return next; })} />{labels.get(key)}</label>)}</div>
                <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setCopyFrom(null)} className="px-3 py-2 text-sm text-ios-gray">{t('cancel')}</button><button type="button" onClick={applyCopy} className="rounded-lg bg-ios-blue px-3 py-2 text-sm font-semibold text-white">{t('apply')}</button></div>
            </div>}
            {!valid && <p role="alert" className="mt-3 text-sm text-ios-red">{t('space_hours_invalid')}</p>}
            {error && <p role="alert" className="mt-3 text-sm text-ios-red">{error}</p>}
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-ios-gray">{t('cancel')}</button><button type="submit" disabled={!valid || saving} className="rounded-xl bg-ios-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? t('saving') : t('save')}</button></div>
        </form>
    </dialog>;
}

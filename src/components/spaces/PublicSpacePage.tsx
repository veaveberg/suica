import { useQuery } from 'convex/react';
import { ChevronDown, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { publicAssetUrl } from '../../utils/assets';
import { SpaceAvailabilityCalendar } from './SpaceAvailabilityCalendar';
import { sourceCalendarRange, type SpaceCalendarMode } from './spaceCalendarModel';
import type { SpaceThemeMode } from './SpaceViewDropdown';

const PUBLIC_LANGUAGES = [
    { label: 'ქარ', menuLabel: 'ქართული', value: 'KA' },
    { label: 'Eng', menuLabel: 'English', value: 'EN' },
    { label: 'Рус', menuLabel: 'Русский', value: 'RU' },
    { label: 'Укр', menuLabel: 'Українська', value: 'UK' },
] as const;

function isThemeMode(value: string | null): value is SpaceThemeMode {
    return value === 'auto' || value === 'light' || value === 'dark';
}

function CalendarPeriodTitle({ period }: { period: string }) {
    const match = period.match(/^(.*?)(\d{4})$/);
    if (!match) return null;
    return <div className="flex items-baseline gap-2 leading-tight"><span className="text-lg font-bold dark:text-white">{match[1].trim()}</span><span className="text-lg font-normal text-ios-gray">{match[2]}</span></div>;
}

function PublicLanguageDropdown() {
    const { i18n } = useTranslation();
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const activeLanguage = PUBLIC_LANGUAGES.find(language => language.value === i18n.language.toUpperCase()) ?? PUBLIC_LANGUAGES[0];

    useEffect(() => {
        const closeOnOutsideTap = (event: PointerEvent) => {
            if (detailsRef.current?.open && !detailsRef.current.contains(event.target as Node)) detailsRef.current.removeAttribute('open');
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') detailsRef.current?.removeAttribute('open');
        };
        document.addEventListener('pointerdown', closeOnOutsideTap);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideTap);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, []);

    const choose = (language: typeof PUBLIC_LANGUAGES[number]['value']) => {
        void i18n.changeLanguage(language);
        detailsRef.current?.removeAttribute('open');
    };

    return <details ref={detailsRef} className="relative z-[60]">
        <summary className="list-none cursor-pointer rounded-xl bg-ios-background px-2.5 py-2 text-xs font-semibold text-ios-gray dark:bg-zinc-800 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5"><span>{activeLanguage.label}</span><ChevronDown className="h-3.5 w-3.5 text-ios-gray" /></span>
        </summary>
        <div className="absolute right-0 top-full z-[60] mt-2 w-max rounded-2xl border border-gray-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex flex-col">
                {PUBLIC_LANGUAGES.map(language => <button key={language.value} type="button" onClick={() => choose(language.value)} className={language.value === activeLanguage.value ? 'whitespace-nowrap rounded-lg bg-white px-2.5 py-2 text-left text-xs font-semibold text-ios-blue shadow-sm dark:bg-zinc-700' : 'whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-ios-gray'}>{language.menuLabel}</button>)}
            </div>
        </div>
    </details>;
}

function PublicCalendar({ publicToken, timeZone, mode, onPeriodChange }: { publicToken: string; timeZone: string; mode: SpaceCalendarMode; onPeriodChange: (period: string) => void }) {
    const { t } = useTranslation();
    const range = sourceCalendarRange(timeZone);
    const result = useQuery(api.spaces.getPublicAvailability, { publicToken, ...range });

    if (result === undefined) return <div className="flex flex-1 items-center justify-center text-sm text-ios-gray">{t('loading')}…</div>;
    if (result === null || result.kind === 'unavailable') return <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ios-gray">{t('space_calendar_unavailable')}</div>;
    return <main className="min-h-0 flex-1"><SpaceAvailabilityCalendar days={result.days} futureAvailabilityOnly mode={mode} onModeChange={() => undefined} onPeriodChange={onPeriodChange} timeZone={result.space.timeZone} workingHours={result.space.workingHours} showToolbar={false} /></main>;
}

export function PublicSpacePage({ publicToken }: { publicToken: string }) {
    const { t, i18n } = useTranslation();
    const hasSetDefaultLanguage = useRef(false);
    const view = new URLSearchParams(window.location.search).get('view');
    const [mode, setMode] = useState<SpaceCalendarMode>(view === 'week' ? 'week' : 'month');
    const [calendarPeriod, setCalendarPeriod] = useState('');
    const [themeMode, setThemeMode] = useState<SpaceThemeMode>(() => {
        const saved = localStorage.getItem('public-theme');
        return isThemeMode(saved) ? saved : 'auto';
    });
    const [isSystemDark, setIsSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
    const isDark = themeMode === 'dark' || (themeMode === 'auto' && isSystemDark);
    const space = useQuery(api.spaces.getPublicSpace, { publicToken });

    useEffect(() => {
        if (hasSetDefaultLanguage.current) return;
        hasSetDefaultLanguage.current = true;
        void i18n.changeLanguage('EN');
    }, [i18n]);

    useEffect(() => {
        const url = new URL(window.location.href);
        if (mode === 'week') url.searchParams.set('view', mode);
        else url.searchParams.delete('view');
        window.history.replaceState({}, '', url.toString());
    }, [mode]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const updateSystemTheme = (event: MediaQueryListEvent) => setIsSystemDark(event.matches);
        mediaQuery.addEventListener('change', updateSystemTheme);
        return () => mediaQuery.removeEventListener('change', updateSystemTheme);
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDark);
        localStorage.setItem('public-theme', themeMode);
    }, [isDark, themeMode]);

    if (space === undefined) return <div className="flex min-h-screen items-center justify-center bg-ios-background text-sm text-ios-gray dark:bg-black">{t('loading')}…</div>;
    if (space === null) return <div className="flex min-h-screen items-center justify-center bg-ios-background px-6 text-center text-sm text-ios-gray dark:bg-black">{t('space_calendar_unavailable')}</div>;

    return <div className="flex h-[100dvh] flex-col overflow-hidden bg-ios-background dark:bg-black">
        <header className="relative z-50 flex shrink-0 flex-col gap-2 border-b border-gray-200 bg-ios-card/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/90">
            <div className="flex items-center justify-between gap-2">
                <img src={publicAssetUrl(space.logoPath)} alt={space.name} className="h-8 w-[148px] shrink-0 object-contain object-left" />
                <div className="flex shrink-0 items-center gap-2">
                    <PublicLanguageDropdown />
                    <button type="button" aria-label={isDark ? t('light') : t('dark')} onClick={() => setThemeMode(isDark ? 'light' : 'dark')} className="rounded-xl bg-ios-background p-2 text-ios-gray dark:bg-zinc-800">
                        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    </button>
                </div>
            </div>
            <div className="flex items-center justify-between gap-2">
                <CalendarPeriodTitle period={calendarPeriod} />
                <div aria-label={t('view')} className="flex shrink-0">
                    {(['week', 'month'] as const).map(value => <button key={value} type="button" onClick={() => setMode(value)} className={mode === value ? 'rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-ios-blue shadow-sm dark:bg-zinc-700' : 'rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ios-gray'}>{t(value)}</button>)}
                </div>
            </div>
        </header>
        <PublicCalendar publicToken={publicToken} timeZone={space.timeZone} mode={mode} onPeriodChange={setCalendarPeriod} />
    </div>;
}

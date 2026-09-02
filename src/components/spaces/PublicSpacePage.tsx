import { useQuery } from 'convex/react';
import { ChevronDown, Globe, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { publicAssetUrl } from '../../utils/assets';
import { SpaceAvailabilityCalendar } from './SpaceAvailabilityCalendar';
import { sourceCalendarRange, type SpaceCalendarMode } from './spaceCalendarModel';

const PUBLIC_LANGUAGES = [
    { label: 'English', value: 'EN' },
    { label: 'Українська', value: 'UK' },
    { label: 'Русский', value: 'RU' },
    { label: 'ქართული', value: 'KA' },
] as const;

function PublicLanguageDropdown() {
    const { i18n } = useTranslation();
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const activeLanguage = PUBLIC_LANGUAGES.find(language => language.value === i18n.language.toUpperCase())?.value ?? 'EN';

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

    return <details ref={detailsRef} className="relative z-50">
        <summary className="list-none cursor-pointer rounded-xl bg-ios-background px-2.5 py-2 text-xs font-semibold text-ios-gray dark:bg-zinc-800 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5"><Globe className="h-4 w-4" /><span>{activeLanguage}</span><ChevronDown className="h-3.5 w-3.5 text-ios-gray" /></span>
        </summary>
        <div className="absolute right-0 top-full z-50 mt-2 w-36 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex flex-col rounded-xl bg-ios-background p-1 dark:bg-zinc-800">
                {PUBLIC_LANGUAGES.map(language => <button key={language.value} type="button" onClick={() => choose(language.value)} className={language.value === activeLanguage ? 'rounded-lg bg-white px-2.5 py-2 text-left text-xs font-semibold text-ios-blue shadow-sm dark:bg-zinc-700' : 'rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-ios-gray'}>{language.label}</button>)}
            </div>
        </div>
    </details>;
}

function PublicCalendar({ publicToken, timeZone, mode }: { publicToken: string; timeZone: string; mode: SpaceCalendarMode }) {
    const { t } = useTranslation();
    const range = sourceCalendarRange(timeZone);
    const result = useQuery(api.spaces.getPublicAvailability, { publicToken, ...range });

    if (result === undefined) return <div className="flex flex-1 items-center justify-center text-sm text-ios-gray">{t('loading')}…</div>;
    if (result === null || result.kind === 'unavailable') return <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ios-gray">{t('space_calendar_unavailable')}</div>;
    return <main className="min-h-0 flex-1"><SpaceAvailabilityCalendar days={result.days} futureAvailabilityOnly mode={mode} onModeChange={() => undefined} timeZone={result.space.timeZone} workingHours={result.space.workingHours} showToolbar={false} /></main>;
}

export function PublicSpacePage({ publicToken }: { publicToken: string }) {
    const { t, i18n } = useTranslation();
    const hasSetDefaultLanguage = useRef(false);
    const view = new URLSearchParams(window.location.search).get('view');
    const [mode, setMode] = useState<SpaceCalendarMode>(view === 'month' ? 'month' : 'week');
    const [isDark, setIsDark] = useState(() => {
        const saved = localStorage.getItem('public-theme');
        return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    const space = useQuery(api.spaces.getPublicSpace, { publicToken });

    useEffect(() => {
        if (hasSetDefaultLanguage.current) return;
        hasSetDefaultLanguage.current = true;
        void i18n.changeLanguage('EN');
    }, [i18n]);

    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('view', mode);
        window.history.replaceState({}, '', url.toString());
    }, [mode]);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDark);
        localStorage.setItem('public-theme', isDark ? 'dark' : 'light');
    }, [isDark]);

    if (space === undefined) return <div className="flex min-h-screen items-center justify-center bg-ios-background text-sm text-ios-gray dark:bg-black">{t('loading')}…</div>;
    if (space === null) return <div className="flex min-h-screen items-center justify-center bg-ios-background px-6 text-center text-sm text-ios-gray dark:bg-black">{t('space_calendar_unavailable')}</div>;

    return <div className="flex h-[100dvh] flex-col overflow-hidden bg-ios-background dark:bg-black">
        <header className="relative z-50 flex shrink-0 items-center justify-between border-b border-gray-200 bg-ios-card/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/90">
            <img src={publicAssetUrl(space.logoPath)} alt={space.name} className="h-8 w-auto max-w-[148px] object-contain" />
            <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsDark(value => !value)} aria-label={isDark ? t('light_mode') : t('dark_mode')} className="rounded-xl bg-ios-background p-2 text-ios-gray dark:bg-zinc-800">{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
                <PublicLanguageDropdown />
                <div className="flex rounded-xl bg-ios-background p-1 text-xs font-semibold dark:bg-zinc-800">
                    <button type="button" onClick={() => setMode('week')} className={mode === 'week' ? 'rounded-lg bg-white px-3 py-1.5 text-ios-blue shadow-sm dark:bg-zinc-700' : 'px-3 py-1.5 text-ios-gray'}>{t('week')}</button>
                    <button type="button" onClick={() => setMode('month')} className={mode === 'month' ? 'rounded-lg bg-white px-3 py-1.5 text-ios-blue shadow-sm dark:bg-zinc-700' : 'px-3 py-1.5 text-ios-gray'}>{t('month')}</button>
                </div>
            </div>
        </header>
        <PublicCalendar publicToken={publicToken} timeZone={space.timeZone} mode={mode} />
    </div>;
}

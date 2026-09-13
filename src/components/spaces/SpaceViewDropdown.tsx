import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/cn';
import type { SpaceCalendarContent, SpaceCalendarMode } from './spaceCalendarModel';

export type SpaceCalendarDisplay = SpaceCalendarContent;
export type SpaceThemeMode = 'auto' | 'light' | 'dark';

type Props = {
    mode: SpaceCalendarMode;
    display: SpaceCalendarDisplay;
    onModeChange: (mode: SpaceCalendarMode) => void;
    onDisplayChange: (display: SpaceCalendarDisplay) => void;
    showNowLine?: boolean;
    onShowNowLineChange?: (show: boolean) => void;
    showDisplayToggle?: boolean;
} & ({ onThemeModeChange: (mode: SpaceThemeMode) => void; themeMode: SpaceThemeMode } | { onThemeModeChange?: never; themeMode?: never });

export function SpaceViewDropdown({ mode, display, onModeChange, onDisplayChange, showNowLine, onShowNowLineChange, onThemeModeChange, showDisplayToggle = true, themeMode }: Props) {
    const { t } = useTranslation();
    const detailsRef = useRef<HTMLDetailsElement>(null);
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
    const choose = (callback: () => void) => {
        callback();
        detailsRef.current?.removeAttribute('open');
    };

    return <details ref={detailsRef} className="relative z-50">
        <summary className="list-none cursor-pointer rounded-xl bg-ios-background px-3 py-2 text-xs font-semibold text-ios-blue dark:bg-zinc-800 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5">{t('view')}<ChevronDown className="h-3.5 w-3.5 text-ios-gray" /></span>
        </summary>
        <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div aria-label={t('view')} className="flex flex-col rounded-xl bg-ios-background p-1 dark:bg-zinc-800">
                {(['week', 'month'] as const).map(value => <button key={value} type="button" onClick={() => choose(() => onModeChange(value))} className={cn('rounded-lg px-2.5 py-2 text-left text-xs font-semibold', mode === value ? 'bg-white text-ios-blue shadow-sm dark:bg-zinc-700' : 'text-ios-gray')}>{t(value)}</button>)}
            </div>
            {showDisplayToggle && <div aria-label={t('availability')} className="mt-2 flex flex-col rounded-xl bg-ios-background p-1 dark:bg-zinc-800">
                {(['availability', 'events'] as const).map(value => <button key={value} type="button" onClick={() => choose(() => onDisplayChange(value))} className={cn('rounded-lg px-2.5 py-2 text-left text-xs font-semibold', display === value ? 'bg-white text-ios-blue shadow-sm dark:bg-zinc-700' : 'text-ios-gray')}>{t(value)}</button>)}
            </div>}
            {showNowLine !== undefined && onShowNowLineChange && <button type="button" aria-pressed={showNowLine} onClick={() => onShowNowLineChange(!showNowLine)} className="mt-2 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-ios-gray hover:bg-ios-background dark:hover:bg-zinc-800">
                <span className="flex-1">{t('red_line')}</span>
                <span aria-hidden="true" className={cn('relative h-5 w-9 rounded-full transition-colors', showNowLine ? 'bg-ios-blue' : 'bg-gray-300 dark:bg-zinc-600')}><span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform', showNowLine ? 'translate-x-4' : 'translate-x-0.5')} /></span>
            </button>}
            {onThemeModeChange && themeMode && <div aria-label={t('theme')} className="mt-2 flex flex-col rounded-xl bg-ios-background p-1 dark:bg-zinc-800">
                {(['auto', 'light', 'dark'] as const).map(value => <button key={value} type="button" onClick={() => choose(() => onThemeModeChange(value))} className={cn('rounded-lg px-2.5 py-2 text-left text-xs font-semibold', themeMode === value ? 'bg-white text-ios-blue shadow-sm dark:bg-zinc-700' : 'text-ios-gray')}>{t(value)}</button>)}
            </div>}
        </div>
    </details>;
}

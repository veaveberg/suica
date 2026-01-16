import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sun, Globe, Trash2, ChevronRight, ArrowLeft, Calendar, Plus, Check, Eye, EyeOff, LogOut } from 'lucide-react';
import {
    clearAllData,
    useExternalCalendars,
    addExternalCalendar,
    updateExternalCalendar,
    deleteExternalCalendar,
    toggleExternalCalendar
} from '../db-server';
import type { Language, ExternalCalendar } from '../types';
import { cn } from '../utils/cn';
import { Migration } from './Migration';
import { useTelegram } from './TelegramProvider';

interface SettingsSheetProps {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
    themeMode: 'auto' | 'light' | 'dark';
    onChangeThemeMode: (mode: 'auto' | 'light' | 'dark') => void;
    onChangeLanguage: (lang: Language) => void;
    onCalendarsChange?: () => void;
}

const CALENDAR_COLORS = [
    '#8E8E93', '#A2845E', '#6B7280', '#7C9885', '#9CA3AF',
    '#B39DDB', '#90A4AE', '#A1887F', '#80CBC4', '#BCAAA4',
];

export const SettingsSheet: React.FC<SettingsSheetProps> = ({
    isOpen,
    onClose,
    themeMode,
    onChangeThemeMode,
    onChangeLanguage,
    onCalendarsChange
}) => {
    const { t, i18n } = useTranslation();
    const [confirmClear, setConfirmClear] = useState(false);
    const [showDangerZone, setShowDangerZone] = useState(false);
    const [showCalendars, setShowCalendars] = useState(false);

    const { data: calendars = [] } = useExternalCalendars();
    const [showAddCalendar, setShowAddCalendar] = useState(false);
    const [editingCalendar, setEditingCalendar] = useState<ExternalCalendar | null>(null);
    const [calendarName, setCalendarName] = useState('');
    const [calendarUrl, setCalendarUrl] = useState('');
    const [calendarColor, setCalendarColor] = useState(CALENDAR_COLORS[0]);

    if (!isOpen) return null;

    const handleClearData = async () => {
        if (!confirmClear) {
            setConfirmClear(true);
            return;
        }
        await clearAllData();
        setConfirmClear(false);
        onClose();
        window.location.reload();
    };

    const handleBack = () => {
        if (showAddCalendar || editingCalendar) {
            setShowAddCalendar(false);
            setEditingCalendar(null);
            setCalendarName('');
            setCalendarUrl('');
            setCalendarColor(CALENDAR_COLORS[0]);
        } else if (showCalendars) {
            setShowCalendars(false);
        } else {
            setShowDangerZone(false);
            setConfirmClear(false);
        }
    };

    const handleStartAdd = () => {
        setShowAddCalendar(true);
        setEditingCalendar(null);
        setCalendarName('');
        setCalendarUrl('');
        setCalendarColor(CALENDAR_COLORS[0]);
    };

    const handleStartEdit = (cal: ExternalCalendar) => {
        setEditingCalendar(cal);
        setShowAddCalendar(false);
        setCalendarName(cal.name);
        setCalendarUrl(cal.url);
        setCalendarColor(cal.color);
    };

    const handleAddCalendar = async () => {
        if (!calendarName.trim() || !calendarUrl.trim()) return;

        if (editingCalendar) {
            await updateExternalCalendar(editingCalendar.id!, {
                name: calendarName,
                url: calendarUrl,
                color: calendarColor
            });
        } else {
            await addExternalCalendar(calendarName, calendarUrl, calendarColor);
        }

        setShowAddCalendar(false);
        setEditingCalendar(null);
        setCalendarName('');
        setCalendarUrl('');
        setCalendarColor(CALENDAR_COLORS[0]);
        onCalendarsChange?.();
    };

    const handleDeleteCalendar = async (id: string) => {
        if (confirm(t('confirm_delete_calendar'))) {
            await deleteExternalCalendar(id);
            onCalendarsChange?.();
        }
    };

    const handleToggleCalendar = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const cal = calendars.find(c => c.id === id);
        if (cal) {
            await toggleExternalCalendar(id, !cal.enabled);
            onCalendarsChange?.();
        }
    };

    const currentLang = i18n.language.toUpperCase() as Language;
    const showingSubpage = showDangerZone || showCalendars;
    const showingCalendarForm = showAddCalendar || !!editingCalendar;

    const SegmentedControl = <T extends string>({
        options,
        value,
        onChange
    }: {
        options: { label: string, value: T }[],
        value: T,
        onChange: (val: T) => void
    }) => {
        const activeIndex = options.findIndex(opt => opt.value === value);
        return (
            <div className="relative flex p-1 bg-ios-background dark:bg-zinc-800 rounded-xl overflow-hidden">
                <div
                    className="absolute top-1 bottom-1 bg-white dark:bg-zinc-600 rounded-lg shadow-sm transition-all duration-200"
                    style={{
                        left: `calc(${(activeIndex / options.length) * 100}% + 4px)`,
                        width: `calc(${100 / options.length}% - 8px)`
                    }}
                />
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            "relative flex-1 py-1.5 text-sm font-medium transition-colors duration-200",
                            value === opt.value
                                ? "text-black dark:text-white"
                                : "text-ios-gray"
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        );
    };

    const { firstName, logout } = useTelegram();

    const renderMainSettings = () => (
        <div className="space-y-6">
            {/* User Info & Logout */}
            <div className="flex items-center justify-between p-4 bg-ios-background dark:bg-zinc-800 rounded-2xl">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-ios-blue/10 rounded-full flex items-center justify-center">
                        <span className="text-ios-blue font-bold">{firstName?.[0] || 'U'}</span>
                    </div>
                    <div>
                        <span className="font-medium dark:text-white">{firstName || t('user')}</span>
                        <p className="text-xs text-ios-gray">{t('logged_in_via_telegram') || 'Logged in via Telegram'}</p>
                    </div>
                </div>
                <button
                    onClick={logout}
                    className="p-2 text-ios-red hover:bg-ios-red/10 rounded-xl transition-colors"
                    title={t('logout')}
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </div>

            <div className="space-y-3">
                <div className="flex items-center gap-3 px-1 text-ios-gray">
                    <Sun className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">{t('theme')}</span>
                </div>
                <SegmentedControl
                    value={themeMode}
                    onChange={onChangeThemeMode}
                    options={[
                        { label: t('auto'), value: 'auto' },
                        { label: t('light'), value: 'light' },
                        { label: t('dark'), value: 'dark' },
                    ]}
                />
            </div>

            <div className="space-y-3">
                <div className="flex items-center gap-3 px-1 text-ios-gray">
                    <Globe className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">{t('language')}</span>
                </div>
                <SegmentedControl
                    value={currentLang}
                    onChange={onChangeLanguage}
                    options={[
                        { label: 'English', value: 'EN' },
                        { label: 'Русский', value: 'RU' },
                        { label: 'ქართული', value: 'KA' },
                    ]}
                />
            </div>

            <button
                onClick={() => setShowCalendars(true)}
                className="w-full flex items-center justify-between p-4 bg-ios-background dark:bg-zinc-800 rounded-2xl active:scale-[0.98] transition-transform text-left"
            >
                <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-ios-blue" />
                    <div>
                        <span className="font-medium dark:text-white">{t('external_calendars')}</span>
                        <p className="text-xs text-ios-gray">
                            {calendars.length === 0
                                ? t('no_calendars')
                                : `${calendars.filter(c => c.enabled).length} ${t('enabled')}`
                            }
                        </p>
                    </div>
                </div>
                <ChevronRight className="w-5 h-5 text-ios-gray/30" />
            </button>

            <button
                onClick={() => setShowDangerZone(true)}
                className="w-full flex items-center justify-between p-4 bg-ios-background dark:bg-zinc-800 rounded-2xl active:scale-[0.98] transition-transform text-left"
            >
                <span className="font-medium text-ios-red">{t('danger_zone')}</span>
                <ChevronRight className="w-5 h-5 text-ios-gray/30" />
            </button>
        </div>
    );

    const renderCalendarForm = () => (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
            <input
                type="text"
                placeholder={t('calendar_name')}
                value={calendarName}
                onChange={(e) => setCalendarName(e.target.value)}
                className="w-full px-4 py-3 bg-ios-background dark:bg-zinc-800 rounded-xl dark:text-white"
            />
            <input
                type="url"
                placeholder={t('ical_url')}
                value={calendarUrl}
                onChange={(e) => setCalendarUrl(e.target.value)}
                className="w-full px-4 py-3 bg-ios-background dark:bg-zinc-800 rounded-xl dark:text-white text-sm"
            />
            <div className="space-y-2">
                <span className="text-xs text-ios-gray uppercase font-semibold">{t('color')}</span>
                <div className="flex gap-2 flex-wrap">
                    {CALENDAR_COLORS.map(color => (
                        <button
                            key={color}
                            onClick={() => setCalendarColor(color)}
                            className={cn(
                                "w-8 h-8 rounded-full transition-transform flex items-center justify-center",
                                calendarColor === color && "scale-110 ring-2 ring-offset-2 ring-ios-blue"
                            )}
                            style={{ backgroundColor: color }}
                        >
                            {calendarColor === color && <Check className="w-4 h-4 text-white" />}
                        </button>
                    ))}
                </div>
            </div>
            <button
                onClick={handleAddCalendar}
                disabled={!calendarName.trim() || !calendarUrl.trim()}
                className="w-full py-3 bg-ios-blue text-white font-semibold rounded-xl disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
                {editingCalendar ? t('save') : t('add_calendar')}
            </button>
            {editingCalendar && (
                <button
                    onClick={() => handleDeleteCalendar(editingCalendar.id!)}
                    className="w-full py-3 text-ios-red font-semibold rounded-xl active:scale-[0.98] transition-transform"
                >
                    {t('delete')}
                </button>
            )}
        </div>
    );

    const renderCalendarsList = () => (
        <div className="space-y-4">
            {calendars.length === 0 ? (
                <div className="text-center py-8 text-ios-gray">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{t('no_external_calendars')}</p>
                    <p className="text-xs mt-1">{t('add_ical_hint')}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {calendars.map(cal => (
                        <div key={cal.id} className="flex items-center gap-2 p-3 bg-ios-background dark:bg-zinc-800 rounded-xl">
                            <button onClick={(e) => handleToggleCalendar(cal.id!, e)} className="p-1 shrink-0">
                                {cal.enabled ? (
                                    <Eye className="w-5 h-5" style={{ color: cal.color }} />
                                ) : (
                                    <EyeOff className="w-5 h-5 text-ios-gray/40" />
                                )}
                            </button>
                            <button onClick={() => handleStartEdit(cal)} className="flex-1 min-w-0 text-left">
                                <p className={cn("font-medium truncate", cal.enabled ? "dark:text-white" : "text-ios-gray/50")}>
                                    {cal.name}
                                </p>
                                <p className="text-xs text-ios-gray/50 truncate">{cal.url}</p>
                            </button>
                            <div className={cn("w-3 h-3 rounded-full shrink-0", !cal.enabled && "opacity-30")} style={{ backgroundColor: cal.color }} />
                            <ChevronRight className="w-4 h-4 text-ios-gray/30 shrink-0" />
                        </div>
                    ))}
                </div>
            )}
            <button
                onClick={handleStartAdd}
                className="w-full flex items-center justify-center gap-2 py-3 bg-ios-blue/10 text-ios-blue font-semibold rounded-xl active:scale-[0.98] transition-transform"
            >
                <Plus className="w-4 h-4" />
                {t('add_calendar')}
            </button>
        </div>
    );

    const renderCalendarsPage = () => (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
            {showingCalendarForm ? renderCalendarForm() : renderCalendarsList()}
        </div>
    );


    const renderDangerZone = () => (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
            <Migration />
            <button
                onClick={handleClearData}
                className={cn(
                    "w-full flex items-center justify-between p-4 rounded-2xl active:scale-[0.98] transition-transform text-left",
                    confirmClear ? "bg-ios-red text-white" : "bg-ios-background dark:bg-zinc-800"
                )}
            >
                <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-xl", confirmClear ? "bg-white/20" : "bg-ios-red/10")}>
                        <Trash2 className={cn("w-5 h-5", confirmClear ? "text-white" : "text-ios-red")} />
                    </div>
                    <div>
                        <span className={cn("font-medium", confirmClear ? "text-white" : "text-ios-red")}>
                            {confirmClear ? t('confirm_reset') : t('clear_data')}
                        </span>
                        <p className={cn("text-xs", confirmClear ? "text-white/70" : "text-ios-gray")}>{t('clear_data_desc')}</p>
                    </div>
                </div>
            </button>
        </div>
    );

    const getTitle = () => {
        if (editingCalendar) return t('edit_calendar');
        if (showAddCalendar) return t('add_calendar');
        if (showCalendars) return t('external_calendars');
        if (showDangerZone) return t('danger_zone');
        return t('settings');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative w-full max-w-md bg-ios-card dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6 space-y-6 min-h-[400px] overflow-hidden">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {(showingSubpage || showingCalendarForm) && (
                            <button onClick={handleBack} className="p-1 -ml-1 active:opacity-50 transition-opacity">
                                <ArrowLeft className="w-6 h-6 text-ios-blue" />
                            </button>
                        )}
                        <h2 className="text-xl font-bold dark:text-white">{getTitle()}</h2>
                    </div>
                    <button onClick={onClose} className="p-1"><X className="w-6 h-6 text-ios-gray" /></button>
                </div>
                {showDangerZone ? renderDangerZone() : showCalendars ? renderCalendarsPage() : renderMainSettings()}
            </div>
        </div>
    );
};

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Book, Layers, Users, Calendar, Settings, CreditCard } from 'lucide-react'

import { Dashboard } from './Dashboard'
import { CalendarView } from './CalendarView'
import { GroupsView } from './GroupsView'
import { StudentsView } from './StudentsView'
import { PassesView } from './PassesView'
import { SettingsSheet } from './SettingsSheet'
import { useData } from '../DataProvider'
import { syncLessonsFromSchedule } from '../db'
import { cn } from '../utils/cn'
import type { Language } from '../types'

export type TabId = 'classes' | 'groups' | 'students' | 'calendar' | 'passes'

interface TeacherAppProps {
    isDark: boolean;
    themeMode: 'auto' | 'light' | 'dark';
    onChangeThemeMode: (mode: 'auto' | 'light' | 'dark') => void;
    onChangeLanguage: (lang: Language) => void;
}

export const TeacherApp: React.FC<TeacherAppProps> = ({
    isDark,
    themeMode,
    onChangeThemeMode,
    onChangeLanguage
}) => {
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState<TabId>('classes')
    const [showSettings, setShowSettings] = useState(false)

    const { students, lessons, subscriptions, refreshLessons } = useData()
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [calendarYearDisplay, setCalendarYearDisplay] = useState('')
    const [externalCalendarsRefresh, setExternalCalendarsRefresh] = useState(0)

    useEffect(() => {
        syncLessonsFromSchedule().then(() => refreshLessons());
    }, [refreshLessons]);

    const tabs: { id: TabId; icon: typeof Book; label: string }[] = [
        { id: 'classes', icon: Book, label: t('classes') || 'Classes' },
        { id: 'groups', icon: Layers, label: t('groups') },
        { id: 'passes', icon: CreditCard, label: t('passes') },
        { id: 'students', icon: Users, label: t('students') },
        { id: 'calendar', icon: Calendar, label: t('calendar') },
    ]

    // Reset selection when changing tabs
    useEffect(() => {
        setIsSelectionMode(false);
    }, [activeTab]);

    return (
        <div className={cn(
            "h-full w-full flex flex-col transition-colors duration-300 overflow-hidden",
            isDark ? 'dark bg-black' : 'bg-ios-background'
        )}>
            {/* Header with Settings */}
            <header
                className="shrink-0 z-40 flex items-center justify-between p-4 bg-ios-card/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-zinc-800"
                style={{ paddingTop: 'max(1rem, var(--safe-area-inset-top))' }}
            >
                <h1 className="text-xl font-bold dark:text-white">
                    {tabs.find(t => t.id === activeTab)?.label}
                    {activeTab === 'calendar' && calendarYearDisplay && (
                        <span className="ml-2 text-ios-gray font-normal">{calendarYearDisplay}</span>
                    )}
                </h1>
                <div className="flex items-center gap-2">
                    {activeTab === 'classes' && (
                        <button
                            onClick={() => setIsSelectionMode(!isSelectionMode)}
                            className="text-ios-blue font-semibold px-2 active:opacity-50 transition-opacity"
                        >
                            {isSelectionMode ? t('cancel') : t('select')}
                        </button>
                    )}
                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-full bg-ios-background dark:bg-zinc-800 active:scale-95 transition-transform"
                    >
                        <Settings className="w-5 h-5 text-ios-gray" />
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden relative">
                <div className={cn("h-full", activeTab !== 'classes' && "hidden")}>
                    <Dashboard
                        students={students}
                        lessons={lessons}
                        isSelectionMode={isSelectionMode}
                        onSelectionModeChange={setIsSelectionMode}
                        externalEventsRefresh={externalCalendarsRefresh}
                        isActive={activeTab === 'classes'}
                    />
                </div>

                <div className={cn("h-full overflow-y-auto overscroll-y-contain", activeTab !== 'groups' && "hidden")}>
                    <GroupsView />
                </div>

                <div className={cn("h-full overflow-y-auto overscroll-y-contain", activeTab !== 'students' && "hidden")}>
                    <StudentsView
                        students={students}
                        subscriptions={subscriptions}
                    />
                </div>

                <div className={cn("h-full", activeTab !== 'calendar' && "hidden")}>
                    <CalendarView
                        onYearChange={setCalendarYearDisplay}
                        externalEventsRefresh={externalCalendarsRefresh}
                        isActive={activeTab === 'calendar'}
                    />
                </div>

                <div className={cn("h-full overflow-y-auto overscroll-y-contain", activeTab !== 'passes' && "hidden")}>
                    <PassesView />
                </div>
            </main>

            {/* Bottom Tab Bar */}
            <nav
                className="shrink-0 z-40 grid grid-cols-5 bg-ios-card/80 dark:bg-zinc-900/80 backdrop-blur-xl border-t border-gray-200 dark:border-zinc-800"
                style={{
                    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                    paddingTop: '8px',
                    minHeight: 'calc(50px + env(safe-area-inset-bottom))'
                }}
            >
                {tabs.map(tab => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex flex-col items-center justify-center py-2 transition-colors",
                                isActive ? 'text-ios-blue' : 'text-ios-gray'
                            )}
                        >
                            <Icon className="w-6 h-6" />
                            <span className="text-[10px] font-medium mt-1">{tab.label}</span>
                        </button>
                    )
                })}
            </nav>

            {/* Settings Sheet */}
            <SettingsSheet
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                isDark={isDark}
                themeMode={themeMode}
                onChangeThemeMode={onChangeThemeMode}
                onChangeLanguage={onChangeLanguage}
                onCalendarsChange={() => setExternalCalendarsRefresh(prev => prev + 1)}
            />
        </div>
    )
}

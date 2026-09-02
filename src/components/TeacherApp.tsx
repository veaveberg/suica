import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Book, Layers, Users, Calendar, Settings, CreditCard, Pencil } from 'lucide-react'
import { useTelegram } from './TelegramProvider'

import { Dashboard } from './Dashboard'
import { CalendarView } from './CalendarView'
import { GroupsView } from './GroupsView'
import { StudentsView } from './StudentsView'
import { PassesView } from './PassesView'
import { SettingsSheet } from './SettingsSheet'
import { StudentCard } from './StudentCard'
import { GroupDetailSheet } from './GroupDetailSheet'
import { useData } from '../DataProvider'
import { syncLessonsFromSchedule } from '../db'
import * as api from '../api'
import { cn } from '../utils/cn'
import { useParam, useSetParam } from '../hooks/useSearchParams'
import type { Language, Subscription } from '../types'
import { CalendarSourceDropdown, type CalendarSource } from './spaces/CalendarSourceDropdown'
import { ManagedSpaceCalendar } from './spaces/ManagedSpaceCalendar'
import { SpaceViewDropdown, type SpaceCalendarDisplay } from './spaces/SpaceViewDropdown'
import { SpaceShareDropdown } from './spaces/SpaceShareDropdown'
import { SpaceHoursSheet } from './spaces/SpaceHoursSheet'

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
    const setParam = useSetParam()
    const tabParam = useParam('tab') as TabId | null
    const sheetParam = useParam('sheet')
    const studentIdParam = useParam('studentId')
    const groupIdParam = useParam('groupId')
    const calendarParam = useParam('calendar')
    const { convexUser } = useTelegram()
    const isStudentGlobal = convexUser?.role === 'student'

    // Sync Active Tab
    const isValidTab = (t: string | null): t is TabId =>
        ['classes', 'groups', 'students', 'calendar', 'passes'].includes(t || '')
    const activeTab = isValidTab(tabParam) ? tabParam : 'classes'

    const setActiveTab = (tab: TabId) => {
        setParam('tab', tab)
    }

    // Sync Settings Sheet
    const showSettings = sheetParam === 'settings'
    const setShowSettings = (show: boolean) => {
        if (show) {
            setParam('sheet', 'settings')
        } else {
            setParam('sheet', null)
        }
    }

    // Sync Student Sheet
    const showStudent = !!studentIdParam
    const setShowStudent = (show: boolean) => {
        if (!show) {
            setParam('studentId', null)
        }
    }

    const { students, groups, lessons, subscriptions, managedSpaces, refreshLessons, refreshSubscriptions } = useData()
    const selectedStudent = students.find(s => String(s.id) === studentIdParam) || null

    // Sync Group Sheet
    const setShowGroup = (show: boolean) => {
        if (!show) {
            setParam('groupId', null)
        }
    }
    const selectedGroup = groups.find(g => String(g.id) === groupIdParam) || null

    const handleBuySubscription = async (newSub: Omit<Subscription, 'id'>): Promise<Subscription> => {
        const createdSub = await api.create<Subscription>('subscriptions', newSub);
        await refreshSubscriptions();
        return createdSub;
    };
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [isEditingSpaceHours, setIsEditingSpaceHours] = useState(false)
    const [calendarPeriodDisplay, setCalendarPeriodDisplay] = useState('')
    const [externalCalendarsRefresh, setExternalCalendarsRefresh] = useState(0)
    const selectedSpaceSlug = calendarParam?.startsWith('space:') ? calendarParam.slice('space:'.length) : null
    const selectedSpace = managedSpaces.find(space => space.slug === selectedSpaceSlug)
    const calendarSource: CalendarSource = selectedSpace ? { kind: 'space', space: selectedSpace } : { kind: 'groups' }
    const spaceCalendarMode = useParam('view') === 'month' ? 'month' : 'week'
    const spaceCalendarDisplay: SpaceCalendarDisplay = useParam('display') === 'events' ? 'events' : 'availability'

    useEffect(() => {
        syncLessonsFromSchedule().then(() => refreshLessons());
    }, [refreshLessons]);

    const tabs: { id: TabId; icon: any; label: string }[] = [
        { id: 'classes', icon: Book, label: t('classes') || 'Classes' },
        { id: 'groups', icon: Layers, label: t('groups') },
        { id: 'passes', icon: CreditCard, label: t('passes') },
        { id: 'students', icon: Users, label: t('students') },
        { id: 'calendar', icon: Calendar, label: t('calendar') },
    ].filter(tab => !isStudentGlobal || tab.id !== 'students') as { id: TabId; icon: any; label: string }[]

    // Reset selection when changing tabs
    useEffect(() => {
        setIsSelectionMode(false);
    }, [activeTab, calendarParam]);

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
                {activeTab === 'calendar' && managedSpaces.length > 0
                    ? <div className="flex min-w-0 items-center gap-2"><span className="truncate text-xl font-bold dark:text-white">{calendarPeriodDisplay}</span><CalendarSourceDropdown selected={calendarSource} spaces={managedSpaces} onChange={value => { setIsEditingSpaceHours(false); setCalendarPeriodDisplay(''); setParam('calendar', value); }} />{calendarSource.kind === 'space' && <button type="button" onClick={() => setIsEditingSpaceHours(true)} aria-label={t('space_edit_hours')} className="shrink-0 rounded-lg p-2 text-ios-gray active:bg-black/5 dark:active:bg-white/10"><Pencil className="h-4 w-4" /></button>}</div>
                    : <h1 className="text-xl font-bold dark:text-white">{activeTab === 'calendar' && calendarPeriodDisplay ? calendarPeriodDisplay : tabs.find(t => t.id === activeTab)?.label}</h1>}
                <div className="flex items-center gap-2">
                    {activeTab === 'calendar' && calendarSource.kind === 'space' && (
                        <>
                            <SpaceViewDropdown mode={spaceCalendarMode} display={spaceCalendarDisplay} onModeChange={value => setParam('view', value)} onDisplayChange={value => setParam('display', value)} />
                            <SpaceShareDropdown space={calendarSource.space} onPreparePost={() => setParam('sheet', 'space-post')} />
                        </>
                    )}
                    {(activeTab === 'classes' || (activeTab === 'calendar' && calendarSource.kind === 'groups')) && (
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
                    {calendarSource.kind === 'groups' ? <CalendarView
                            onPeriodChange={setCalendarPeriodDisplay}
                            externalEventsRefresh={externalCalendarsRefresh}
                            isActive={activeTab === 'calendar'}
                            isSelectionMode={isSelectionMode}
                            onSelectionModeChange={setIsSelectionMode}
                        /> : <ManagedSpaceCalendar key={calendarSource.space.id} space={calendarSource.space} onPeriodChange={setCalendarPeriodDisplay} />}
                </div>

                <div className={cn("h-full overflow-y-auto overscroll-y-contain", activeTab !== 'passes' && "hidden")}>
                    <PassesView />
                </div>
            </main>

            {/* Bottom Tab Bar */}
            <nav
                className={cn(
                    "shrink-0 z-40 grid bg-ios-card/80 dark:bg-zinc-900/80 backdrop-blur-xl border-t border-gray-200 dark:border-zinc-800",
                    isStudentGlobal ? "grid-cols-4" : "grid-cols-5"
                )}
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

            {/* Global Student Card */}
            <StudentCard
                isOpen={showStudent}
                student={selectedStudent}
                subscriptions={subscriptions}
                onClose={() => setShowStudent(false)}
                onBuySubscription={handleBuySubscription}
                readOnly={isStudentGlobal || (!!selectedStudent && !!convexUser?.tokenIdentifier && selectedStudent.userId !== convexUser.tokenIdentifier && convexUser.role !== 'admin')}
            />

            {/* Global Group Sheet */}
            {selectedGroup && (
                <GroupDetailSheet
                    group={selectedGroup}
                    onClose={() => setShowGroup(false)}
                />
            )}
            {calendarSource.kind === 'space' && isEditingSpaceHours && <SpaceHoursSheet space={calendarSource.space} onClose={() => setIsEditingSpaceHours(false)} />}
        </div>
    )
}

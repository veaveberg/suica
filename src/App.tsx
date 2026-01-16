import { useState, useEffect } from 'react'
import { Dashboard } from './components/Dashboard'
import { CalendarView } from './components/CalendarView'
import { GroupsView } from './components/GroupsView'
import { StudentsView } from './components/StudentsView'
import { PassesView } from './components/PassesView'
import { SettingsSheet } from './components/SettingsSheet'
import './i18n'
import { useTranslation } from 'react-i18next'
import type { Language } from './types'
import { useData } from './DataProvider'
import { syncLessonsFromSchedule } from './db'
import { useTelegram } from './components/TelegramProvider'
import { Book, Layers, Users, Calendar, Settings, CreditCard } from 'lucide-react'
import { cn } from './utils/cn'
import { StudentPortal } from './components/StudentPortal'
import { LoginPage } from './components/LoginPage'

type TabId = 'classes' | 'groups' | 'students' | 'calendar' | 'passes'

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('classes')
  const [showSettings, setShowSettings] = useState(false)
  const { t, i18n } = useTranslation()
  const { colorScheme: tgColorScheme, isTelegram, convexUser, loginStandalone, onAuth, isReady } = useTelegram()

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ios-background dark:bg-black">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ios-blue shadow-lg"></div>
      </div>
    );
  }

  // Initialize theme from localStorage or 'auto'
  const [themeMode, setThemeMode] = useState<'auto' | 'light' | 'dark'>(() => {
    return (localStorage.getItem('theme-mode') as 'auto' | 'light' | 'dark') || 'auto'
  })

  // Initial system dark mode
  const [isSystemDark, setIsSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setIsSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Derived dark mode state
  const isDark = themeMode === 'auto'
    ? (isTelegram ? tgColorScheme === 'dark' : isSystemDark)
    : themeMode === 'dark'

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)

    // Update theme-color meta tag for Safari/Mobile devices
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', isDark ? '#000000' : '#F2F2F7')
  }, [isDark])

  const changeThemeMode = (mode: 'auto' | 'light' | 'dark') => {
    setThemeMode(mode)
    localStorage.setItem('theme-mode', mode)
  }

  const changeLanguage = (lang: Language) => {
    i18n.changeLanguage(lang)
  }

  if (!convexUser) {
    return (
      <LoginPage
        onTelegramAuth={onAuth}
        isDark={isDark}
        themeMode={themeMode}
        onChangeThemeMode={changeThemeMode}
        onChangeLanguage={changeLanguage}
      />
    );
  }

  if (convexUser?.role === 'student') {
    return <StudentPortal />
  }

  const { students, lessons, subscriptions, refreshLessons } = useData()
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [calendarYearDisplay, setCalendarYearDisplay] = useState('')
  const [externalCalendarsRefresh, setExternalCalendarsRefresh] = useState(0)

  useEffect(() => {
    syncLessonsFromSchedule().then(() => refreshLessons());
  }, [refreshLessons]);

  const changeLanguage = (lang: Language) => {
    i18n.changeLanguage(lang)
  }

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
        onChangeThemeMode={changeThemeMode}
        onChangeLanguage={changeLanguage}
        onCalendarsChange={() => setExternalCalendarsRefresh(prev => prev + 1)}
      />
    </div>
  )
}

export default App

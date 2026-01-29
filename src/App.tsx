import { useState, useEffect } from 'react'
import './i18n'
import { useTranslation } from 'react-i18next'
import type { Language } from './types'
import { useTelegram } from './components/TelegramProvider'
import { LoginPage } from './components/LoginPage'
import { TeacherApp } from './components/TeacherApp'

function App() {
  const { i18n } = useTranslation()
  const { colorScheme: tgColorScheme, isTelegram, convexUser, onAuth, isReady } = useTelegram()

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

  return (
    <TeacherApp
      isDark={isDark}
      themeMode={themeMode}
      onChangeThemeMode={changeThemeMode}
      onChangeLanguage={changeLanguage}
    />
  )
}

export default App

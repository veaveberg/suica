import { useState, useEffect } from 'react'
import './i18n'
import { useTranslation } from 'react-i18next'
import type { Language } from './types'
import { TelegramProvider, useTelegram } from './components/TelegramProvider'
import { LoginPage } from './components/LoginPage'
import { TeacherApp } from './components/TeacherApp'
import { DataProvider } from './DataProvider'
import { PublicSpacePage } from './components/spaces/PublicSpacePage'

function AuthenticatedApp() {
  const { i18n } = useTranslation()
  const { colorScheme: tgColorScheme, isTelegram, convexUser, onAuth, isReady, authError } = useTelegram()
  const securityNotice = !convexUser && sessionStorage.getItem('suica_security_reauth_notice')
    ? 'security_reauth_notice'
    : null

  useEffect(() => {
    if (!convexUser && securityNotice) {
      sessionStorage.removeItem('suica_security_reauth_notice')
    }
  }, [convexUser, securityNotice])

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

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ios-background dark:bg-black">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ios-blue shadow-lg"></div>
      </div>
    );
  }

  if (!convexUser) {
    return (
      <LoginPage
        onTelegramAuth={onAuth}
        securityNoticeKey={securityNotice}
        authError={authError}
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

function publicTokenFromCurrentUrl(): string | null {
  const url = new URL(window.location.href)
  const forwardedPath = url.searchParams.get('__public_path')
  if (forwardedPath?.startsWith('/') && !forwardedPath.startsWith('//')) {
    const forwardedUrl = new URL(forwardedPath, window.location.origin)
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
    const restoredPath = `${basePath}${forwardedUrl.pathname}${forwardedUrl.search}${forwardedUrl.hash}`
    window.history.replaceState({}, '', restoredPath)
    return forwardedUrl.pathname.split('/').filter(Boolean).at(-1) ?? null
  }

  const queryToken = url.searchParams.get('space')
  if (queryToken) return queryToken

  const basePath = import.meta.env.BASE_URL
  const relativePath = url.pathname.startsWith(basePath)
    ? url.pathname.slice(basePath.length)
    : url.pathname.replace(/^\/+/, '')
  const segments = relativePath.split('/').filter(Boolean)
  if (segments.length !== 1) return null

  try {
    return decodeURIComponent(segments[0])
  } catch {
    return null
  }
}

function App() {
  const publicToken = publicTokenFromCurrentUrl()
  if (publicToken) return <PublicSpacePage publicToken={publicToken} />

  return <TelegramProvider>
    <DataProvider>
      <AuthenticatedApp />
    </DataProvider>
  </TelegramProvider>
}

export default App

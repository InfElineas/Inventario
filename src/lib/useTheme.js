import { useState, useCallback, useLayoutEffect } from 'react'

const STORAGE_KEY = 'elineas_theme'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  return localStorage.getItem(STORAGE_KEY) || 'dark'
}

export function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme)

  // Sync class to DOM on every theme change (including initial mount)
  useLayoutEffect(() => {
    document.documentElement.classList.remove('dark', 'light')
    document.documentElement.classList.add(theme)
  }, [theme])

  const setTheme = useCallback((next) => {
    localStorage.setItem(STORAGE_KEY, next)
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' }
}

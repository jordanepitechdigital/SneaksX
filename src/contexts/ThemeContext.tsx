'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
  // Current theme state
  theme: Theme
  resolvedTheme: ResolvedTheme

  // Theme actions
  setTheme: (theme: Theme) => void
  toggleTheme: () => void

  // System theme detection
  systemTheme: ResolvedTheme

  // Theme loading state
  isLoading: boolean
}

const STORAGE_KEY = 'sneaksx-theme'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

const ThemeContext = createContext<ThemeContextType | null>(null)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// Helper function to get system theme
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light'
}

// Helper function to resolve theme
function resolveTheme(theme: Theme, systemTheme: ResolvedTheme): ResolvedTheme {
  if (theme === 'system') return systemTheme
  return theme as ResolvedTheme
}

// Helper function to apply theme to document
function applyThemeToDocument(resolvedTheme: ResolvedTheme) {
  if (typeof window === 'undefined') return

  const root = window.document.documentElement
  const isDark = resolvedTheme === 'dark'

  // Update class
  root.classList.remove('light', 'dark')
  root.classList.add(resolvedTheme)

  // Update data attribute for CSS selectors
  root.setAttribute('data-theme', resolvedTheme)

  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isDark ? '#0a0a0a' : '#ffffff')
  }

  // Update color-scheme for native form controls
  root.style.colorScheme = resolvedTheme
}

export const ThemeProvider = ({
  children,
  defaultTheme = 'system',
  storageKey = STORAGE_KEY
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}) => {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('light')
  const [isLoading, setIsLoading] = useState(true)

  // Initialize theme from storage and system preference
  useEffect(() => {
    try {
      // Get system theme
      const currentSystemTheme = getSystemTheme()
      setSystemTheme(currentSystemTheme)

      // Get saved theme from storage
      const savedTheme = localStorage.getItem(storageKey) as Theme
      const initialTheme = savedTheme || defaultTheme

      setThemeState(initialTheme)

      // Apply theme immediately to prevent flash
      const resolvedTheme = resolveTheme(initialTheme, currentSystemTheme)
      applyThemeToDocument(resolvedTheme)

      setIsLoading(false)
    } catch (error) {
      console.error('Error initializing theme:', error)
      setIsLoading(false)
    }
  }, [defaultTheme, storageKey])

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(MEDIA_QUERY)

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const newSystemTheme = e.matches ? 'dark' : 'light'
      setSystemTheme(newSystemTheme)
    }

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange)
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
    // Legacy browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleSystemThemeChange)
      return () => mediaQuery.removeListener(handleSystemThemeChange)
    }
  }, [])

  // Apply theme when theme or system theme changes
  const resolvedTheme = resolveTheme(theme, systemTheme)
  useEffect(() => {
    if (!isLoading) {
      applyThemeToDocument(resolvedTheme)
    }
  }, [resolvedTheme, isLoading])

  // Theme actions
  const setTheme = useCallback((newTheme: Theme) => {
    try {
      setThemeState(newTheme)
      localStorage.setItem(storageKey, newTheme)
    } catch (error) {
      console.error('Error saving theme to storage:', error)
    }
  }, [storageKey])

  const toggleTheme = useCallback(() => {
    if (theme === 'system') {
      // If system theme, toggle to opposite of current system preference
      setTheme(systemTheme === 'dark' ? 'light' : 'dark')
    } else {
      // Toggle between light and dark
      setTheme(theme === 'light' ? 'dark' : 'light')
    }
  }, [theme, systemTheme, setTheme])

  const value: ThemeContextType = {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    systemTheme,
    isLoading,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

// Hook for theme-aware components
export const useThemeClass = (lightClass: string, darkClass: string) => {
  const { resolvedTheme } = useTheme()
  return resolvedTheme === 'dark' ? darkClass : lightClass
}

// Hook for conditional theme rendering
export const useIsDark = () => {
  const { resolvedTheme } = useTheme()
  return resolvedTheme === 'dark'
}

// Hook for theme colors
export const useThemeColors = () => {
  const { resolvedTheme } = useTheme()

  return resolvedTheme === 'dark'
    ? {
        background: '#0a0a0a',
        foreground: '#fafafa',
        primary: '#ffffff',
        secondary: '#262626',
        accent: '#3b82f6',
        muted: '#404040',
        border: '#27272a',
      }
    : {
        background: '#ffffff',
        foreground: '#0a0a0a',
        primary: '#0a0a0a',
        secondary: '#f4f4f5',
        accent: '#3b82f6',
        muted: '#6b7280',
        border: '#e4e4e7',
      }
}

// Hook for CSS variables (for use with Tailwind CSS dark mode)
export const useThemeVariables = () => {
  const { resolvedTheme } = useTheme()

  return {
    '--theme': resolvedTheme,
    '--is-dark': resolvedTheme === 'dark' ? '1' : '0',
    '--is-light': resolvedTheme === 'light' ? '1' : '0',
  } as React.CSSProperties
}
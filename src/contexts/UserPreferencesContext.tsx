'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useReducer } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'

// Currency options
export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY'

// Language options
export type Language = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko'

// Size preference (US, UK, EU, etc.)
export type SizeSystem = 'US' | 'UK' | 'EU' | 'CM' | 'JP'

// Layout preferences
export type GridLayout = 'grid' | 'list' | 'compact'
export type ProductsPerPage = 12 | 24 | 48 | 96

// Notification preferences
export interface NotificationSettings {
  email: {
    orderUpdates: boolean
    promotions: boolean
    priceDrops: boolean
    restockAlerts: boolean
    newsletter: boolean
  }
  push: {
    orderUpdates: boolean
    promotions: boolean
    priceDrops: boolean
    restockAlerts: boolean
  }
  sms: {
    orderUpdates: boolean
    securityAlerts: boolean
  }
}

// Shopping preferences
export interface ShoppingPreferences {
  preferredBrands: string[]
  preferredCategories: string[]
  priceRange: {
    min: number
    max: number
  }
  favoriteProducts: string[]
  wishlist: string[]
  recentlyViewed: string[]
  searchHistory: string[]
}

// Accessibility preferences
export interface AccessibilitySettings {
  reducedMotion: boolean
  highContrast: boolean
  largerText: boolean
  screenReaderOptimized: boolean
  keyboardNavigation: boolean
}

// Complete user preferences interface
export interface UserPreferences {
  // Localization
  currency: Currency
  language: Language
  sizeSystem: SizeSystem

  // Display
  gridLayout: GridLayout
  productsPerPage: ProductsPerPage
  showPricesInMultipleCurrencies: boolean

  // Notifications
  notifications: NotificationSettings

  // Shopping
  shopping: ShoppingPreferences

  // Accessibility
  accessibility: AccessibilitySettings

  // Privacy
  analytics: boolean
  marketing: boolean
  dataSharing: boolean

  // System
  autoSaveCart: boolean
  rememberFilters: boolean
  quickBuyEnabled: boolean

  // Meta
  lastUpdated: string
  version: number
}

// Default preferences
const DEFAULT_PREFERENCES: UserPreferences = {
  currency: 'USD',
  language: 'en',
  sizeSystem: 'US',
  gridLayout: 'grid',
  productsPerPage: 24,
  showPricesInMultipleCurrencies: false,
  notifications: {
    email: {
      orderUpdates: true,
      promotions: false,
      priceDrops: true,
      restockAlerts: true,
      newsletter: false,
    },
    push: {
      orderUpdates: true,
      promotions: false,
      priceDrops: false,
      restockAlerts: true,
    },
    sms: {
      orderUpdates: false,
      securityAlerts: true,
    },
  },
  shopping: {
    preferredBrands: [],
    preferredCategories: [],
    priceRange: { min: 0, max: 1000 },
    favoriteProducts: [],
    wishlist: [],
    recentlyViewed: [],
    searchHistory: [],
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    largerText: false,
    screenReaderOptimized: false,
    keyboardNavigation: false,
  },
  analytics: true,
  marketing: false,
  dataSharing: false,
  autoSaveCart: true,
  rememberFilters: true,
  quickBuyEnabled: false,
  lastUpdated: new Date().toISOString(),
  version: 1,
}

// Preference action types
type PreferenceAction =
  | { type: 'LOAD_PREFERENCES'; payload: UserPreferences }
  | { type: 'UPDATE_PREFERENCE'; payload: { key: keyof UserPreferences; value: any } }
  | { type: 'UPDATE_NESTED_PREFERENCE'; payload: { path: string[]; value: any } }
  | { type: 'ADD_TO_ARRAY'; payload: { path: string[]; value: any } }
  | { type: 'REMOVE_FROM_ARRAY'; payload: { path: string[]; value: any } }
  | { type: 'RESET_PREFERENCES' }
  | { type: 'SET_LOADING'; payload: boolean }

interface PreferenceState {
  preferences: UserPreferences
  isLoading: boolean
  isSaving: boolean
}

function preferencesReducer(state: PreferenceState, action: PreferenceAction): PreferenceState {
  switch (action.type) {
    case 'LOAD_PREFERENCES':
      return {
        ...state,
        preferences: {
          ...action.payload,
          lastUpdated: new Date().toISOString(),
        },
        isLoading: false,
      }

    case 'UPDATE_PREFERENCE':
      return {
        ...state,
        preferences: {
          ...state.preferences,
          [action.payload.key]: action.payload.value,
          lastUpdated: new Date().toISOString(),
          version: state.preferences.version + 1,
        },
      }

    case 'UPDATE_NESTED_PREFERENCE': {
      const { path, value } = action.payload
      const newPreferences = { ...state.preferences }
      let current: any = newPreferences

      // Navigate to the nested property
      for (let i = 0; i < path.length - 1; i++) {
        current[path[i]] = { ...current[path[i]] }
        current = current[path[i]]
      }

      // Set the value
      current[path[path.length - 1]] = value

      return {
        ...state,
        preferences: {
          ...newPreferences,
          lastUpdated: new Date().toISOString(),
          version: state.preferences.version + 1,
        },
      }
    }

    case 'ADD_TO_ARRAY': {
      const { path, value } = action.payload
      const newPreferences = { ...state.preferences }
      let current: any = newPreferences

      // Navigate to the array
      for (let i = 0; i < path.length - 1; i++) {
        current[path[i]] = { ...current[path[i]] }
        current = current[path[i]]
      }

      const arrayKey = path[path.length - 1]
      current[arrayKey] = [...(current[arrayKey] || []), value]

      return {
        ...state,
        preferences: {
          ...newPreferences,
          lastUpdated: new Date().toISOString(),
          version: state.preferences.version + 1,
        },
      }
    }

    case 'REMOVE_FROM_ARRAY': {
      const { path, value } = action.payload
      const newPreferences = { ...state.preferences }
      let current: any = newPreferences

      // Navigate to the array
      for (let i = 0; i < path.length - 1; i++) {
        current[path[i]] = { ...current[path[i]] }
        current = current[path[i]]
      }

      const arrayKey = path[path.length - 1]
      current[arrayKey] = (current[arrayKey] || []).filter((item: any) => item !== value)

      return {
        ...state,
        preferences: {
          ...newPreferences,
          lastUpdated: new Date().toISOString(),
          version: state.preferences.version + 1,
        },
      }
    }

    case 'RESET_PREFERENCES':
      return {
        ...state,
        preferences: {
          ...DEFAULT_PREFERENCES,
          lastUpdated: new Date().toISOString(),
          version: 1,
        },
      }

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      }

    default:
      return state
  }
}

interface UserPreferencesContextType {
  // State
  preferences: UserPreferences
  isLoading: boolean
  isSaving: boolean

  // Actions
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void
  updateNestedPreference: (path: string[], value: any) => void
  addToArray: (path: string[], value: any) => void
  removeFromArray: (path: string[], value: any) => void
  resetPreferences: () => void

  // Convenience methods
  setCurrency: (currency: Currency) => void
  setLanguage: (language: Language) => void
  setSizeSystem: (sizeSystem: SizeSystem) => void
  setGridLayout: (layout: GridLayout) => void
  addToWishlist: (productId: string) => void
  removeFromWishlist: (productId: string) => void
  addToRecentlyViewed: (productId: string) => void
  addToSearchHistory: (query: string) => void

  // Export/Import
  exportPreferences: () => string
  importPreferences: (data: string) => void
}

const STORAGE_KEY = 'sneaksx-preferences'

const UserPreferencesContext = createContext<UserPreferencesContextType | null>(null)

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext)
  if (!context) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider')
  }
  return context
}

export const UserPreferencesProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(preferencesReducer, {
    preferences: DEFAULT_PREFERENCES,
    isLoading: true,
    isSaving: false,
  })
  const { user, isAuthenticated } = useAuth()

  // Load preferences on mount
  useEffect(() => {
    loadPreferences()
  }, [user?.id])

  // Save preferences when they change
  useEffect(() => {
    if (!state.isLoading) {
      savePreferences()
    }
  }, [state.preferences])

  // Load preferences from storage and Supabase
  const loadPreferences = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })

      // Load from localStorage first
      const localPreferences = localStorage.getItem(STORAGE_KEY)
      if (localPreferences) {
        const parsed = JSON.parse(localPreferences)
        dispatch({ type: 'LOAD_PREFERENCES', payload: { ...DEFAULT_PREFERENCES, ...parsed } })
      }

      // Load from Supabase if user is authenticated
      if (isAuthenticated && user?.id) {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('preferences')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading user preferences:', error)
        } else if (data) {
          dispatch({
            type: 'LOAD_PREFERENCES',
            payload: { ...DEFAULT_PREFERENCES, ...data.preferences }
          })
        }
      }
    } catch (error) {
      console.error('Error loading preferences:', error)
      dispatch({ type: 'LOAD_PREFERENCES', payload: DEFAULT_PREFERENCES })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [user?.id, isAuthenticated])

  // Save preferences to storage and Supabase
  const savePreferences = useCallback(async () => {
    try {
      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.preferences))

      // Save to Supabase if user is authenticated
      if (isAuthenticated && user?.id) {
        const { error } = await supabase
          .from('user_preferences')
          .upsert({
            user_id: user.id,
            preferences: state.preferences,
            updated_at: new Date().toISOString(),
          })

        if (error) {
          console.error('Error saving preferences to Supabase:', error)
        }
      }
    } catch (error) {
      console.error('Error saving preferences:', error)
    }
  }, [state.preferences, user?.id, isAuthenticated])

  // Action methods
  const updatePreference = useCallback(<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    dispatch({ type: 'UPDATE_PREFERENCE', payload: { key, value } })
  }, [])

  const updateNestedPreference = useCallback((path: string[], value: any) => {
    dispatch({ type: 'UPDATE_NESTED_PREFERENCE', payload: { path, value } })
  }, [])

  const addToArray = useCallback((path: string[], value: any) => {
    dispatch({ type: 'ADD_TO_ARRAY', payload: { path, value } })
  }, [])

  const removeFromArray = useCallback((path: string[], value: any) => {
    dispatch({ type: 'REMOVE_FROM_ARRAY', payload: { path, value } })
  }, [])

  const resetPreferences = useCallback(() => {
    dispatch({ type: 'RESET_PREFERENCES' })
  }, [])

  // Convenience methods
  const setCurrency = useCallback((currency: Currency) => {
    updatePreference('currency', currency)
  }, [updatePreference])

  const setLanguage = useCallback((language: Language) => {
    updatePreference('language', language)
  }, [updatePreference])

  const setSizeSystem = useCallback((sizeSystem: SizeSystem) => {
    updatePreference('sizeSystem', sizeSystem)
  }, [updatePreference])

  const setGridLayout = useCallback((layout: GridLayout) => {
    updatePreference('gridLayout', layout)
  }, [updatePreference])

  const addToWishlist = useCallback((productId: string) => {
    if (!state.preferences.shopping.wishlist.includes(productId)) {
      addToArray(['shopping', 'wishlist'], productId)
    }
  }, [state.preferences.shopping.wishlist, addToArray])

  const removeFromWishlist = useCallback((productId: string) => {
    removeFromArray(['shopping', 'wishlist'], productId)
  }, [removeFromArray])

  const addToRecentlyViewed = useCallback((productId: string) => {
    const recent = state.preferences.shopping.recentlyViewed
    const filtered = recent.filter(id => id !== productId)
    const updated = [productId, ...filtered].slice(0, 20) // Keep last 20 items
    updateNestedPreference(['shopping', 'recentlyViewed'], updated)
  }, [state.preferences.shopping.recentlyViewed, updateNestedPreference])

  const addToSearchHistory = useCallback((query: string) => {
    const history = state.preferences.shopping.searchHistory
    const filtered = history.filter(q => q !== query)
    const updated = [query, ...filtered].slice(0, 10) // Keep last 10 searches
    updateNestedPreference(['shopping', 'searchHistory'], updated)
  }, [state.preferences.shopping.searchHistory, updateNestedPreference])

  // Export/Import methods
  const exportPreferences = useCallback(() => {
    return JSON.stringify(state.preferences, null, 2)
  }, [state.preferences])

  const importPreferences = useCallback((data: string) => {
    try {
      const parsed = JSON.parse(data)
      dispatch({
        type: 'LOAD_PREFERENCES',
        payload: { ...DEFAULT_PREFERENCES, ...parsed }
      })
    } catch (error) {
      console.error('Error importing preferences:', error)
      throw new Error('Invalid preferences data')
    }
  }, [])

  const value: UserPreferencesContextType = {
    preferences: state.preferences,
    isLoading: state.isLoading,
    isSaving: state.isSaving,
    updatePreference,
    updateNestedPreference,
    addToArray,
    removeFromArray,
    resetPreferences,
    setCurrency,
    setLanguage,
    setSizeSystem,
    setGridLayout,
    addToWishlist,
    removeFromWishlist,
    addToRecentlyViewed,
    addToSearchHistory,
    exportPreferences,
    importPreferences,
  }

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  )
}

// Convenience hooks for specific preferences
export const useCurrency = () => {
  const { preferences, setCurrency } = useUserPreferences()
  return { currency: preferences.currency, setCurrency }
}

export const useLanguage = () => {
  const { preferences, setLanguage } = useUserPreferences()
  return { language: preferences.language, setLanguage }
}

export const useGridLayout = () => {
  const { preferences, setGridLayout } = useUserPreferences()
  return { gridLayout: preferences.gridLayout, setGridLayout }
}

export const useWishlist = () => {
  const { preferences, addToWishlist, removeFromWishlist } = useUserPreferences()
  return {
    wishlist: preferences.shopping.wishlist,
    addToWishlist,
    removeFromWishlist,
    isInWishlist: (productId: string) => preferences.shopping.wishlist.includes(productId),
  }
}

export const useRecentlyViewed = () => {
  const { preferences, addToRecentlyViewed } = useUserPreferences()
  return {
    recentlyViewed: preferences.shopping.recentlyViewed,
    addToRecentlyViewed,
  }
}

export const useSearchHistory = () => {
  const { preferences, addToSearchHistory } = useUserPreferences()
  return {
    searchHistory: preferences.shopping.searchHistory,
    addToSearchHistory,
  }
}
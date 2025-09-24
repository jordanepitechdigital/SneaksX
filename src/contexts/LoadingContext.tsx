'use client'

import React, { createContext, useContext, useReducer, useCallback } from 'react'

// Loading states for different operations
export interface LoadingState {
  [key: string]: {
    isLoading: boolean
    progress?: number // 0-100 for progress bars
    message?: string
    startTime?: number
    estimatedDuration?: number
  }
}

// Loading action types
type LoadingAction =
  | { type: 'START_LOADING'; payload: { key: string; message?: string; estimatedDuration?: number } }
  | { type: 'STOP_LOADING'; payload: { key: string } }
  | { type: 'UPDATE_PROGRESS'; payload: { key: string; progress: number; message?: string } }
  | { type: 'SET_MESSAGE'; payload: { key: string; message: string } }
  | { type: 'CLEAR_ALL' }

// Loading reducer
function loadingReducer(state: LoadingState, action: LoadingAction): LoadingState {
  switch (action.type) {
    case 'START_LOADING':
      return {
        ...state,
        [action.payload.key]: {
          isLoading: true,
          progress: 0,
          message: action.payload.message,
          startTime: Date.now(),
          estimatedDuration: action.payload.estimatedDuration,
        },
      }

    case 'STOP_LOADING': {
      const { [action.payload.key]: removed, ...rest } = state
      return rest
    }

    case 'UPDATE_PROGRESS':
      return {
        ...state,
        [action.payload.key]: {
          ...state[action.payload.key],
          progress: action.payload.progress,
          message: action.payload.message || state[action.payload.key]?.message,
        },
      }

    case 'SET_MESSAGE':
      return {
        ...state,
        [action.payload.key]: {
          ...state[action.payload.key],
          message: action.payload.message,
        },
      }

    case 'CLEAR_ALL':
      return {}

    default:
      return state
  }
}

// Loading context interface
interface LoadingContextType {
  loadingState: LoadingState
  isLoading: (key: string) => boolean
  isAnyLoading: () => boolean
  getProgress: (key: string) => number | undefined
  getMessage: (key: string) => string | undefined
  getEstimatedTimeRemaining: (key: string) => number | undefined
  startLoading: (key: string, message?: string, estimatedDuration?: number) => void
  stopLoading: (key: string) => void
  updateProgress: (key: string, progress: number, message?: string) => void
  setMessage: (key: string, message: string) => void
  clearAll: () => void
  withLoading: <T>(key: string, operation: () => Promise<T>, message?: string) => Promise<T>
}

const LoadingContext = createContext<LoadingContextType | null>(null)

export const useLoading = () => {
  const context = useContext(LoadingContext)
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider')
  }
  return context
}

// Loading provider component
export const LoadingProvider = ({ children }: { children: React.ReactNode }) => {
  const [loadingState, dispatch] = useReducer(loadingReducer, {})

  const isLoading = useCallback((key: string) => {
    return loadingState[key]?.isLoading || false
  }, [loadingState])

  const isAnyLoading = useCallback(() => {
    return Object.values(loadingState).some(state => state.isLoading)
  }, [loadingState])

  const getProgress = useCallback((key: string) => {
    return loadingState[key]?.progress
  }, [loadingState])

  const getMessage = useCallback((key: string) => {
    return loadingState[key]?.message
  }, [loadingState])

  const getEstimatedTimeRemaining = useCallback((key: string) => {
    const state = loadingState[key]
    if (!state || !state.startTime || !state.estimatedDuration) {
      return undefined
    }

    const elapsed = Date.now() - state.startTime
    const remaining = state.estimatedDuration - elapsed
    return Math.max(0, remaining)
  }, [loadingState])

  const startLoading = useCallback((key: string, message?: string, estimatedDuration?: number) => {
    dispatch({
      type: 'START_LOADING',
      payload: { key, message, estimatedDuration }
    })
  }, [])

  const stopLoading = useCallback((key: string) => {
    dispatch({
      type: 'STOP_LOADING',
      payload: { key }
    })
  }, [])

  const updateProgress = useCallback((key: string, progress: number, message?: string) => {
    dispatch({
      type: 'UPDATE_PROGRESS',
      payload: { key, progress, message }
    })
  }, [])

  const setMessage = useCallback((key: string, message: string) => {
    dispatch({
      type: 'SET_MESSAGE',
      payload: { key, message }
    })
  }, [])

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' })
  }, [])

  const withLoading = useCallback(async <T,>(
    key: string,
    operation: () => Promise<T>,
    message?: string
  ): Promise<T> => {
    try {
      startLoading(key, message)
      const result = await operation()
      return result
    } finally {
      stopLoading(key)
    }
  }, [startLoading, stopLoading])

  const value: LoadingContextType = {
    loadingState,
    isLoading,
    isAnyLoading,
    getProgress,
    getMessage,
    getEstimatedTimeRemaining,
    startLoading,
    stopLoading,
    updateProgress,
    setMessage,
    clearAll,
    withLoading,
  }

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  )
}

// Convenience hooks for common loading patterns
export const useApiLoading = () => {
  const loading = useLoading()

  return {
    isApiLoading: () => loading.isLoading('api'),
    startApiLoading: (message?: string) => loading.startLoading('api', message),
    stopApiLoading: () => loading.stopLoading('api'),
    withApiLoading: (operation: () => Promise<any>, message?: string) =>
      loading.withLoading('api', operation, message),
  }
}

export const useAuthLoading = () => {
  const loading = useLoading()

  return {
    isAuthLoading: () => loading.isLoading('auth'),
    startAuthLoading: (message?: string) => loading.startLoading('auth', message),
    stopAuthLoading: () => loading.stopLoading('auth'),
    withAuthLoading: (operation: () => Promise<any>, message?: string) =>
      loading.withLoading('auth', operation, message),
  }
}

export const useCartLoading = () => {
  const loading = useLoading()

  return {
    isCartLoading: () => loading.isLoading('cart'),
    startCartLoading: (message?: string) => loading.startLoading('cart', message),
    stopCartLoading: () => loading.stopLoading('cart'),
    withCartLoading: (operation: () => Promise<any>, message?: string) =>
      loading.withLoading('cart', operation, message),
  }
}

export const useProductLoading = () => {
  const loading = useLoading()

  return {
    isProductLoading: () => loading.isLoading('products'),
    startProductLoading: (message?: string) => loading.startLoading('products', message),
    stopProductLoading: () => loading.stopLoading('products'),
    withProductLoading: (operation: () => Promise<any>, message?: string) =>
      loading.withLoading('products', operation, message),
  }
}

// Global loading indicators components
export const GlobalLoadingIndicator = () => {
  const { isAnyLoading } = useLoading()

  if (!isAnyLoading()) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className="h-1 bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" />
    </div>
  )
}

export const LoadingOverlay = ({
  loadingKey,
  className = ""
}: {
  loadingKey: string
  className?: string
}) => {
  const { isLoading, getMessage, getProgress } = useLoading()

  if (!isLoading(loadingKey)) return null

  const message = getMessage(loadingKey)
  const progress = getProgress(loadingKey)

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${className}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
        <div className="flex items-center justify-center mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>

        {message && (
          <p className="text-center text-gray-700 dark:text-gray-300 mb-4">
            {message}
          </p>
        )}

        {typeof progress === 'number' && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export const LoadingSpinner = ({
  loadingKey,
  size = 'sm',
  className = ""
}: {
  loadingKey: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) => {
  const { isLoading } = useLoading()

  if (!isLoading(loadingKey)) return null

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  }

  return (
    <div className={`animate-spin rounded-full border-b-2 border-current ${sizeClasses[size]} ${className}`} />
  )
}

// HOC for automatic loading states
export function withLoadingState<P extends object>(
  Component: React.ComponentType<P>,
  loadingKey: string,
  message?: string
) {
  return function WrappedComponent(props: P) {
    const { startLoading, stopLoading } = useLoading()

    React.useEffect(() => {
      startLoading(loadingKey, message)
      return () => stopLoading(loadingKey)
    }, [])

    return <Component {...props} />
  }
}
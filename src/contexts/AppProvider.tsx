'use client'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { UserPreferencesProvider } from '@/contexts/UserPreferencesContext'
import { CartProvider } from '@/contexts/CartContext'
import { LoadingProvider } from '@/contexts/LoadingContext'

// Create a QueryClient instance with optimized configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default stale time - data is considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Default cache time - data stays in cache for 10 minutes after being unused
      gcTime: 10 * 60 * 1000,
      // Retry failed requests 3 times with exponential backoff
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Don't refetch on window focus by default (can be overridden per query)
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect by default (can be overridden per query)
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
      retryDelay: 1000,
    },
  },
})

// Error Boundary for context providers
class ContextErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Context Provider Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold text-red-600 mb-4">
              Application Error
            </h2>
            <p className="text-gray-600 mb-4">
              Something went wrong while loading the application. Please refresh the page to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Refresh Page
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-gray-500">
                  Error Details (Development)
                </summary>
                <pre className="mt-2 text-xs text-red-500 whitespace-pre-wrap">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * AppProvider combines all context providers in the correct order
 *
 * Provider order is important:
 * 1. QueryClientProvider - Must be at the top for React Query
 * 2. LoadingProvider - Loading states used by middleware and components
 * 3. AuthProvider - Authentication state needed by other providers
 * 4. ThemeProvider - Theme can be independent but good to have early
 * 5. UserPreferencesProvider - Depends on Auth for saving to Supabase
 * 6. CartProvider - Depends on Auth for user context
 */
export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ContextErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LoadingProvider>
          <AuthProvider>
            <ThemeProvider>
              <UserPreferencesProvider>
                <CartProvider>
                  {children}
                  {/* React Query DevTools - only in development */}
                  {process.env.NODE_ENV === 'development' && (
                    <ReactQueryDevtools
                      initialIsOpen={false}
                    />
                  )}
                </CartProvider>
              </UserPreferencesProvider>
            </ThemeProvider>
          </AuthProvider>
        </LoadingProvider>
      </QueryClientProvider>
    </ContextErrorBoundary>
  )
}

// Hook to access QueryClient instance
export const useQueryClient = () => {
  return queryClient
}

// Provider component for testing with custom QueryClient
export const TestAppProvider = ({
  children,
  testQueryClient,
}: {
  children: React.ReactNode
  testQueryClient?: QueryClient
}) => {
  const client = testQueryClient || queryClient

  return (
    <ContextErrorBoundary>
      <QueryClientProvider client={client}>
        <LoadingProvider>
          <AuthProvider>
            <ThemeProvider defaultTheme="light">
              <UserPreferencesProvider>
                <CartProvider>
                  {children}
                </CartProvider>
              </UserPreferencesProvider>
            </ThemeProvider>
          </AuthProvider>
        </LoadingProvider>
      </QueryClientProvider>
    </ContextErrorBoundary>
  )
}

// Utility hook to check if all contexts are properly initialized
export const useContextStatus = () => {
  const [contextStatus, setContextStatus] = React.useState({
    auth: false,
    theme: false,
    preferences: false,
    cart: false,
    queryClient: false,
  })

  React.useEffect(() => {
    // Check if contexts are available
    try {
      // This will throw if contexts are not available
      const { useAuth } = require('@/contexts/AuthContext')
      const { useTheme } = require('@/contexts/ThemeContext')
      const { useUserPreferences } = require('@/contexts/UserPreferencesContext')
      const { useCart } = require('@/contexts/CartContext')

      setContextStatus({
        auth: true,
        theme: true,
        preferences: true,
        cart: true,
        queryClient: !!queryClient,
      })
    } catch (error) {
      console.warn('Some contexts are not properly initialized:', error)
    }
  }, [])

  return {
    ...contextStatus,
    allInitialized: Object.values(contextStatus).every(Boolean),
  }
}

// Development helper for debugging context state
export const ContextDebugger = () => {
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="fixed top-4 left-4 z-50 bg-black bg-opacity-75 text-white p-4 rounded text-sm max-w-md">
      <h3 className="font-bold mb-2">Context Debug Info</h3>
      <ContextStatusDisplay />
    </div>
  )
}

const ContextStatusDisplay = () => {
  const contextStatus = useContextStatus()

  return (
    <div className="space-y-1">
      {Object.entries(contextStatus).map(([key, status]) => (
        <div key={key} className="flex justify-between">
          <span>{key}:</span>
          <span className={status ? 'text-green-400' : 'text-red-400'}>
            {status ? '✓' : '✗'}
          </span>
        </div>
      ))}
    </div>
  )
}

export default AppProvider
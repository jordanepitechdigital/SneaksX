/**
 * React Query Error Boundary Integration
 * Provides seamless error handling integration with React Query
 */

import { useQueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import { useEffect } from 'react'
import { AppError, ErrorType, ErrorSeverity, ErrorReporter } from '@/services/api/error-types'
import { useLoading } from '@/contexts/LoadingContext'

/**
 * Hook for handling React Query errors globally
 */
export function useReactQueryErrorHandler() {
  const queryClient = useQueryClient()
  const { stopLoading } = useLoading()

  useEffect(() => {
    // Global error handler for queries
    const queryCache = queryClient.getQueryCache()
    const originalOnError = queryCache.config.onError

    queryCache.config.onError = (error, query) => {
      // Stop any loading states
      const queryKey = query.queryKey
      if (Array.isArray(queryKey) && queryKey.length > 0) {
        const loadingKey = queryKey[0] as string
        stopLoading(loadingKey)
      }

      // Convert to AppError if needed
      const appError = error instanceof AppError
        ? error
        : new AppError(
            error?.message || 'Query failed',
            ErrorType.UNKNOWN_ERROR,
            ErrorSeverity.MEDIUM,
            undefined,
            undefined,
            { queryKey: query.queryKey }
          )

      // Report error
      ErrorReporter.report(appError, {
        component: 'ReactQuery',
        action: 'query',
        context: { queryKey: query.queryKey }
      })

      // Call original error handler if it exists
      originalOnError?.(error, query)
    }

    // Global error handler for mutations
    const mutationCache = queryClient.getMutationCache()
    const originalMutationOnError = mutationCache.config.onError

    mutationCache.config.onError = (error, variables, context, mutation) => {
      // Convert to AppError if needed
      const appError = error instanceof AppError
        ? error
        : new AppError(
            error?.message || 'Mutation failed',
            ErrorType.UNKNOWN_ERROR,
            ErrorSeverity.MEDIUM,
            undefined,
            undefined,
            { mutationKey: mutation.options.mutationKey, variables }
          )

      // Report error
      ErrorReporter.report(appError, {
        component: 'ReactQuery',
        action: 'mutation',
        context: {
          mutationKey: mutation.options.mutationKey,
          variables
        }
      })

      // Call original error handler if it exists
      originalMutationOnError?.(error, variables, context, mutation)
    }

    // Cleanup function
    return () => {
      queryCache.config.onError = originalOnError
      mutationCache.config.onError = originalMutationOnError
    }
  }, [queryClient, stopLoading])
}

/**
 * Hook for retry logic with React Query
 */
export function useQueryRetry() {
  return {
    retry: (failureCount: number, error: any) => {
      // Don't retry client errors (4xx)
      if (error instanceof AppError) {
        if (error.type === ErrorType.BAD_REQUEST ||
            error.type === ErrorType.FORBIDDEN ||
            error.type === ErrorType.NOT_FOUND) {
          return false
        }

        // Use AppError retry logic
        return error.isRetryable && failureCount < 3
      }

      // Default retry logic for non-AppError
      return failureCount < 3
    },
    retryDelay: (attemptIndex: number) => {
      return Math.min(1000 * 2 ** attemptIndex, 30000)
    }
  }
}

/**
 * Enhanced mutation hook with error handling
 */
export function useErrorAwareMutation<TData = unknown, TError = unknown, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: {
    onSuccess?: (data: TData, variables: TVariables) => void
    onError?: (error: TError, variables: TVariables) => void
    loadingKey?: string
  } = {}
) {
  const { startLoading, stopLoading } = useLoading()
  const { onSuccess, onError, loadingKey } = options

  return {
    mutationFn: async (variables: TVariables): Promise<TData> => {
      try {
        if (loadingKey) {
          startLoading(loadingKey)
        }

        const result = await mutationFn(variables)

        onSuccess?.(result, variables)
        return result
      } catch (error) {
        const appError = error instanceof AppError
          ? error
          : new AppError(
              (error as Error)?.message || 'Mutation failed',
              ErrorType.UNKNOWN_ERROR,
              ErrorSeverity.MEDIUM
            )

        onError?.(appError as TError, variables)
        throw appError
      } finally {
        if (loadingKey) {
          stopLoading(loadingKey)
        }
      }
    }
  }
}

/**
 * Query invalidation with error handling
 */
export function useInvalidateQueries() {
  const queryClient = useQueryClient()

  return {
    invalidate: async (queryKey: unknown[], exact = false) => {
      try {
        await queryClient.invalidateQueries({
          queryKey,
          exact
        })
      } catch (error) {
        const appError = new AppError(
          'Failed to invalidate queries',
          ErrorType.UNKNOWN_ERROR,
          ErrorSeverity.LOW,
          undefined,
          'Failed to refresh data',
          { queryKey }
        )

        ErrorReporter.report(appError, {
          component: 'QueryInvalidation',
          action: 'invalidate'
        })

        console.warn('Query invalidation failed:', error)
      }
    },

    refetch: async (queryKey: unknown[]) => {
      try {
        await queryClient.refetchQueries({ queryKey })
      } catch (error) {
        const appError = new AppError(
          'Failed to refetch queries',
          ErrorType.UNKNOWN_ERROR,
          ErrorSeverity.LOW,
          undefined,
          'Failed to refresh data',
          { queryKey }
        )

        ErrorReporter.report(appError, {
          component: 'QueryRefetch',
          action: 'refetch'
        })

        console.warn('Query refetch failed:', error)
      }
    }
  }
}

/**
 * Optimistic updates with error handling
 */
export function useOptimisticUpdate<TData>() {
  const queryClient = useQueryClient()

  return {
    setOptimisticData: (queryKey: unknown[], updater: (old: TData | undefined) => TData) => {
      const previousData = queryClient.getQueryData<TData>(queryKey)

      try {
        queryClient.setQueryData<TData>(queryKey, updater)
        return previousData
      } catch (error) {
        const appError = new AppError(
          'Failed to set optimistic data',
          ErrorType.UNKNOWN_ERROR,
          ErrorSeverity.LOW,
          undefined,
          'Failed to update data optimistically',
          { queryKey }
        )

        ErrorReporter.report(appError, {
          component: 'OptimisticUpdate',
          action: 'setData'
        })

        return previousData
      }
    },

    rollback: (queryKey: unknown[], previousData: TData | undefined) => {
      try {
        if (previousData !== undefined) {
          queryClient.setQueryData<TData>(queryKey, previousData)
        } else {
          queryClient.removeQueries({ queryKey })
        }
      } catch (error) {
        const appError = new AppError(
          'Failed to rollback optimistic update',
          ErrorType.UNKNOWN_ERROR,
          ErrorSeverity.MEDIUM,
          undefined,
          'Failed to restore previous data',
          { queryKey }
        )

        ErrorReporter.report(appError, {
          component: 'OptimisticUpdate',
          action: 'rollback'
        })

        console.error('Optimistic update rollback failed:', error)
      }
    }
  }
}

/**
 * Error boundary for query components
 */
export interface QueryErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: AppError; retry: () => void }>
  onError?: (error: AppError) => void
}

export function QueryErrorBoundary({
  children,
  fallback: Fallback,
  onError
}: QueryErrorBoundaryProps) {
  const { invalidate } = useInvalidateQueries()

  return (
    <ReactQueryErrorBoundary
      onError={(error) => {
        const appError = error instanceof AppError
          ? error
          : new AppError(
              error.message || 'Component error',
              ErrorType.UNKNOWN_ERROR,
              ErrorSeverity.HIGH
            )

        ErrorReporter.report(appError, {
          component: 'QueryErrorBoundary',
          action: 'componentError'
        })

        onError?.(appError)
      }}
      fallback={({ error, resetErrorBoundary }) => {
        const appError = error instanceof AppError ? error : new AppError(
          error.message,
          ErrorType.UNKNOWN_ERROR
        )

        if (Fallback) {
          return <Fallback error={appError} retry={resetErrorBoundary} />
        }

        return (
          <div className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
              Something went wrong
            </h3>
            <p className="text-red-600 dark:text-red-300 mb-4">
              {appError.userMessage}
            </p>
            <button
              onClick={resetErrorBoundary}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Try again
            </button>
          </div>
        )
      }}
    >
      {children}
    </ReactQueryErrorBoundary>
  )
}

// Import the actual error boundary from React Query
import { ErrorBoundary as ReactQueryErrorBoundary } from 'react-error-boundary'

export { ReactQueryErrorBoundary }

/**
 * Hook to get error state from React Query
 */
export function useQueryErrorState() {
  const queryClient = useQueryClient()

  const getQueriesWithErrors = () => {
    return queryClient.getQueryCache().getAll()
      .filter(query => query.state.status === 'error')
      .map(query => ({
        queryKey: query.queryKey,
        error: query.state.error,
        errorUpdatedAt: query.state.errorUpdatedAt,
        failureCount: query.state.failureCount,
        failureReason: query.state.failureReason
      }))
  }

  const clearErrorQueries = () => {
    queryClient.removeQueries({
      predicate: (query) => query.state.status === 'error'
    })
  }

  return {
    errorQueries: getQueriesWithErrors(),
    hasErrors: getQueriesWithErrors().length > 0,
    clearErrors: clearErrorQueries
  }
}
/**
 * Advanced Optimistic Updates Utilities
 * Provides reusable patterns for optimistic UI updates with automatic rollback
 */

import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useCallback, useTransition, useRef } from 'react'
import { useLoading } from '@/contexts/LoadingContext'
import { AppError, ErrorType, ErrorSeverity } from '@/services/api/error-types'

// Generic types for optimistic operations
export interface OptimisticConfig<TData, TVariables, TError = AppError> {
  queryKey: unknown[]
  mutationFn: (variables: TVariables) => Promise<TData>
  updateFn: (oldData: any, variables: TVariables) => any
  rollbackFn?: (oldData: any, variables: TVariables) => any
  loadingKey?: string
  loadingMessage?: string
  onMutate?: (variables: TVariables) => Promise<any> | any
  onError?: (error: TError, variables: TVariables, context: any) => void
  onSuccess?: (data: TData, variables: TVariables, context: any) => void
  onSettled?: (data: TData | undefined, error: TError | null, variables: TVariables, context: any) => void
  enableTransitions?: boolean
  retryAttempts?: number
  retryDelay?: (attemptIndex: number) => number
}

export interface BatchOptimisticConfig<TData, TVariables, TError = AppError> {
  operations: Array<{
    queryKey: unknown[]
    updateFn: (oldData: any, variables: TVariables) => any
    rollbackFn?: (oldData: any, variables: TVariables) => any
  }>
  mutationFn: (variables: TVariables) => Promise<TData>
  loadingKey?: string
  loadingMessage?: string
  onError?: (error: TError, variables: TVariables, context: any) => void
  onSuccess?: (data: TData, variables: TVariables, context: any) => void
}

/**
 * Advanced optimistic update hook with comprehensive error handling
 */
export function useAdvancedOptimistic<TData, TVariables, TError = AppError>(
  config: OptimisticConfig<TData, TVariables, TError>
) {
  const queryClient = useQueryClient()
  const { startLoading, stopLoading } = useLoading()
  const [isPending, startTransition] = useTransition()
  const contextRef = useRef<any>(null)

  const mutation = useMutation({
    mutationFn: config.mutationFn,

    onMutate: async (variables) => {
      const loadingKey = config.loadingKey || `optimistic-${Date.now()}`

      if (config.loadingMessage) {
        startLoading(loadingKey, config.loadingMessage)
      }

      try {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: config.queryKey })

        // Snapshot previous data
        const previousData = queryClient.getQueryData(config.queryKey)

        // Run custom onMutate if provided
        const customContext = config.onMutate ? await config.onMutate(variables) : undefined

        // Apply optimistic update
        if (config.updateFn && previousData !== undefined) {
          const updateOperation = () => {
            const optimisticData = config.updateFn(previousData, variables)
            queryClient.setQueryData(config.queryKey, optimisticData)
          }

          if (config.enableTransitions) {
            startTransition(updateOperation)
          } else {
            updateOperation()
          }
        }

        // Store context for rollback
        const context = {
          previousData,
          customContext,
          loadingKey,
          variables
        }
        contextRef.current = context

        return context
      } catch (error) {
        if (config.loadingMessage) {
          stopLoading(loadingKey)
        }
        throw error
      }
    },

    onError: (error, variables, context) => {
      console.error('Optimistic update failed:', error)

      if (context?.loadingKey && config.loadingMessage) {
        stopLoading(context.loadingKey)
      }

      // Rollback optimistic update
      if (context?.previousData !== undefined) {
        const rollbackOperation = () => {
          if (config.rollbackFn) {
            const rolledBackData = config.rollbackFn(context.previousData, variables)
            queryClient.setQueryData(config.queryKey, rolledBackData)
          } else {
            queryClient.setQueryData(config.queryKey, context.previousData)
          }
        }

        if (config.enableTransitions) {
          startTransition(rollbackOperation)
        } else {
          rollbackOperation()
        }
      }

      // Run custom error handler
      if (config.onError) {
        config.onError(error as TError, variables, context)
      }
    },

    onSuccess: (data, variables, context) => {
      if (context?.loadingKey && config.loadingMessage) {
        stopLoading(context.loadingKey)
      }

      // Run custom success handler
      if (config.onSuccess) {
        config.onSuccess(data, variables, context)
      }

      // Invalidate queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: config.queryKey })
    },

    onSettled: (data, error, variables, context) => {
      if (context?.loadingKey && config.loadingMessage) {
        stopLoading(context.loadingKey)
      }

      // Run custom settled handler
      if (config.onSettled) {
        config.onSettled(data, error as TError | null, variables, context)
      }

      // Always ensure queries are invalidated
      queryClient.invalidateQueries({ queryKey: config.queryKey })
    },

    retry: config.retryAttempts || 3,
    retryDelay: config.retryDelay || ((attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000))
  })

  return {
    ...mutation,
    isPending: isPending || mutation.isPending,
    context: contextRef.current
  }
}

/**
 * Batch optimistic updates for multiple queries
 */
export function useBatchOptimistic<TData, TVariables, TError = AppError>(
  config: BatchOptimisticConfig<TData, TVariables, TError>
) {
  const queryClient = useQueryClient()
  const { startLoading, stopLoading } = useLoading()
  const [isPending, startTransition] = useTransition()

  const mutation = useMutation({
    mutationFn: config.mutationFn,

    onMutate: async (variables) => {
      const loadingKey = config.loadingKey || `batch-optimistic-${Date.now()}`

      if (config.loadingMessage) {
        startLoading(loadingKey, config.loadingMessage)
      }

      try {
        // Cancel queries for all operations
        const cancelPromises = config.operations.map(op =>
          queryClient.cancelQueries({ queryKey: op.queryKey })
        )
        await Promise.all(cancelPromises)

        // Snapshot all previous data
        const previousDataMap = new Map()
        config.operations.forEach(op => {
          const previousData = queryClient.getQueryData(op.queryKey)
          previousDataMap.set(op.queryKey.join('-'), previousData)
        })

        // Apply optimistic updates to all operations
        const updateOperation = () => {
          config.operations.forEach(op => {
            const previousData = previousDataMap.get(op.queryKey.join('-'))
            if (previousData !== undefined) {
              const optimisticData = op.updateFn(previousData, variables)
              queryClient.setQueryData(op.queryKey, optimisticData)
            }
          })
        }

        startTransition(updateOperation)

        return {
          previousDataMap,
          loadingKey,
          variables
        }
      } catch (error) {
        if (config.loadingMessage) {
          stopLoading(loadingKey)
        }
        throw error
      }
    },

    onError: (error, variables, context) => {
      console.error('Batch optimistic update failed:', error)

      if (context?.loadingKey && config.loadingMessage) {
        stopLoading(context.loadingKey)
      }

      // Rollback all optimistic updates
      if (context?.previousDataMap) {
        const rollbackOperation = () => {
          config.operations.forEach(op => {
            const previousData = context.previousDataMap.get(op.queryKey.join('-'))
            if (previousData !== undefined) {
              if (op.rollbackFn) {
                const rolledBackData = op.rollbackFn(previousData, variables)
                queryClient.setQueryData(op.queryKey, rolledBackData)
              } else {
                queryClient.setQueryData(op.queryKey, previousData)
              }
            }
          })
        }

        startTransition(rollbackOperation)
      }

      // Run custom error handler
      if (config.onError) {
        config.onError(error as TError, variables, context)
      }
    },

    onSuccess: (data, variables, context) => {
      if (context?.loadingKey && config.loadingMessage) {
        stopLoading(context.loadingKey)
      }

      // Run custom success handler
      if (config.onSuccess) {
        config.onSuccess(data, variables, context)
      }

      // Invalidate all queries
      config.operations.forEach(op => {
        queryClient.invalidateQueries({ queryKey: op.queryKey })
      })
    },

    onSettled: (data, error, variables, context) => {
      if (context?.loadingKey && config.loadingMessage) {
        stopLoading(context.loadingKey)
      }

      // Always ensure all queries are invalidated
      config.operations.forEach(op => {
        queryClient.invalidateQueries({ queryKey: op.queryKey })
      })
    }
  })

  return {
    ...mutation,
    isPending: isPending || mutation.isPending
  }
}

/**
 * Optimistic list operations (add, remove, update, reorder)
 */
export function useOptimisticList<TItem extends { id: string }, TVariables = any>(
  queryKey: unknown[]
) {
  const queryClient = useQueryClient()
  const { startLoading, stopLoading } = useLoading()

  const createListMutation = useCallback(<TData>(
    config: {
      mutationFn: (variables: TVariables) => Promise<TData>
      operation: 'add' | 'remove' | 'update' | 'reorder'
      optimisticUpdate: (items: TItem[], variables: TVariables) => TItem[]
      loadingMessage?: string
      onSuccess?: (data: TData, variables: TVariables) => void
      onError?: (error: AppError, variables: TVariables) => void
    }
  ) => {
    return useMutation({
      mutationFn: config.mutationFn,

      onMutate: async (variables) => {
        const loadingKey = `list-${config.operation}-${Date.now()}`

        if (config.loadingMessage) {
          startLoading(loadingKey, config.loadingMessage)
        }

        // Cancel outgoing refetches
        await queryClient.cancelQueries({ queryKey })

        // Snapshot previous data
        const previousItems = queryClient.getQueryData<TItem[]>(queryKey) || []

        // Apply optimistic update
        const optimisticItems = config.optimisticUpdate(previousItems, variables)
        queryClient.setQueryData(queryKey, optimisticItems)

        return { previousItems, loadingKey }
      },

      onError: (error, variables, context) => {
        console.error(`Optimistic list ${config.operation} failed:`, error)

        if (context?.loadingKey && config.loadingMessage) {
          stopLoading(context.loadingKey)
        }

        // Rollback
        if (context?.previousItems) {
          queryClient.setQueryData(queryKey, context.previousItems)
        }

        if (config.onError) {
          config.onError(error as AppError, variables)
        }
      },

      onSuccess: (data, variables, context) => {
        if (context?.loadingKey && config.loadingMessage) {
          stopLoading(context.loadingKey)
        }

        if (config.onSuccess) {
          config.onSuccess(data, variables)
        }

        // Invalidate to get fresh server data
        queryClient.invalidateQueries({ queryKey })
      },

      onSettled: (_, __, ___, context) => {
        if (context?.loadingKey && config.loadingMessage) {
          stopLoading(context.loadingKey)
        }
        queryClient.invalidateQueries({ queryKey })
      }
    })
  }, [queryClient, queryKey, startLoading, stopLoading])

  // Convenience methods for common list operations
  const addItem = useCallback((config: {
    mutationFn: (item: Omit<TItem, 'id'>) => Promise<TItem>
    position?: 'start' | 'end'
    loadingMessage?: string
    onSuccess?: (data: TItem, item: Omit<TItem, 'id'>) => void
  }) => {
    return createListMutation({
      mutationFn: config.mutationFn,
      operation: 'add',
      optimisticUpdate: (items, newItem) => {
        const tempItem = {
          ...newItem,
          id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        } as TItem

        return config.position === 'end'
          ? [...items, tempItem]
          : [tempItem, ...items]
      },
      loadingMessage: config.loadingMessage,
      onSuccess: config.onSuccess
    })
  }, [createListMutation])

  const removeItem = useCallback((config: {
    mutationFn: (id: string) => Promise<void>
    loadingMessage?: string
    onSuccess?: (data: void, id: string) => void
  }) => {
    return createListMutation({
      mutationFn: config.mutationFn,
      operation: 'remove',
      optimisticUpdate: (items, itemId) =>
        items.filter(item => item.id !== itemId),
      loadingMessage: config.loadingMessage,
      onSuccess: config.onSuccess
    })
  }, [createListMutation])

  const updateItem = useCallback((config: {
    mutationFn: (update: { id: string } & Partial<TItem>) => Promise<TItem>
    loadingMessage?: string
    onSuccess?: (data: TItem, update: { id: string } & Partial<TItem>) => void
  }) => {
    return createListMutation({
      mutationFn: config.mutationFn,
      operation: 'update',
      optimisticUpdate: (items, update) =>
        items.map(item =>
          item.id === update.id
            ? { ...item, ...update }
            : item
        ),
      loadingMessage: config.loadingMessage,
      onSuccess: config.onSuccess
    })
  }, [createListMutation])

  const reorderItems = useCallback((config: {
    mutationFn: (order: string[]) => Promise<TItem[]>
    loadingMessage?: string
    onSuccess?: (data: TItem[], order: string[]) => void
  }) => {
    return createListMutation({
      mutationFn: config.mutationFn,
      operation: 'reorder',
      optimisticUpdate: (items, newOrder) => {
        const itemMap = new Map(items.map(item => [item.id, item]))
        return newOrder.map(id => itemMap.get(id)!).filter(Boolean)
      },
      loadingMessage: config.loadingMessage,
      onSuccess: config.onSuccess
    })
  }, [createListMutation])

  return {
    addItem,
    removeItem,
    updateItem,
    reorderItems,
    createListMutation
  }
}

/**
 * Optimistic toggle operations (like/unlike, follow/unfollow, etc.)
 */
export function useOptimisticToggle<TData = any>(
  queryKey: unknown[],
  config: {
    toggleFn: (currentState: boolean) => Promise<TData>
    getToggleState: (data: any) => boolean
    updateToggleState: (data: any, newState: boolean) => any
    loadingMessage?: string
    onSuccess?: (data: TData, newState: boolean) => void
    onError?: (error: AppError, targetState: boolean) => void
  }
) {
  const queryClient = useQueryClient()
  const { startLoading, stopLoading } = useLoading()

  return useMutation({
    mutationFn: async () => {
      const currentData = queryClient.getQueryData(queryKey)
      const currentState = currentData ? config.getToggleState(currentData) : false
      return config.toggleFn(!currentState)
    },

    onMutate: async () => {
      const loadingKey = `toggle-${queryKey.join('-')}-${Date.now()}`

      if (config.loadingMessage) {
        startLoading(loadingKey, config.loadingMessage)
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot previous data
      const previousData = queryClient.getQueryData(queryKey)

      if (previousData) {
        const currentState = config.getToggleState(previousData)
        const newState = !currentState
        const optimisticData = config.updateToggleState(previousData, newState)

        queryClient.setQueryData(queryKey, optimisticData)

        return { previousData, targetState: newState, loadingKey }
      }

      return { previousData, loadingKey }
    },

    onError: (error, _, context) => {
      console.error('Optimistic toggle failed:', error)

      if (context?.loadingKey && config.loadingMessage) {
        stopLoading(context.loadingKey)
      }

      // Rollback
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData)
      }

      if (config.onError && context?.targetState !== undefined) {
        config.onError(error as AppError, context.targetState)
      }
    },

    onSuccess: (data, _, context) => {
      if (context?.loadingKey && config.loadingMessage) {
        stopLoading(context.loadingKey)
      }

      if (config.onSuccess && context?.targetState !== undefined) {
        config.onSuccess(data, context.targetState)
      }

      // Invalidate to get fresh server data
      queryClient.invalidateQueries({ queryKey })
    },

    onSettled: (_, __, ___, context) => {
      if (context?.loadingKey && config.loadingMessage) {
        stopLoading(context.loadingKey)
      }
      queryClient.invalidateQueries({ queryKey })
    }
  })
}

/**
 * Pre-configured optimistic patterns for common use cases
 */
export const optimisticPatterns = {
  // Simple counter increment/decrement
  counter: (queryKey: unknown[], mutationFn: (delta: number) => Promise<number>) =>
    useAdvancedOptimistic({
      queryKey,
      mutationFn,
      updateFn: (current: number, delta: number) => current + delta,
      rollbackFn: (current: number, delta: number) => current - delta,
      enableTransitions: true
    }),

  // Boolean toggle
  toggle: (queryKey: unknown[], mutationFn: () => Promise<boolean>) =>
    useAdvancedOptimistic({
      queryKey,
      mutationFn,
      updateFn: (current: boolean) => !current,
      rollbackFn: (current: boolean) => !current,
      enableTransitions: true
    }),

  // Array append
  append: <T>(queryKey: unknown[], mutationFn: (item: T) => Promise<T[]>) =>
    useAdvancedOptimistic({
      queryKey,
      mutationFn,
      updateFn: (current: T[], newItem: T) => [...current, newItem],
      rollbackFn: (current: T[], newItem: T) => current.slice(0, -1),
      enableTransitions: true
    })
}
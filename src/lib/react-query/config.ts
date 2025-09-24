/**
 * React Query Configuration
 * Comprehensive configuration for optimal caching, prefetching, and performance
 */

import { QueryClient, DefaultOptions } from '@tanstack/react-query';
import { toast } from 'sonner';

// Error handler for React Query
const queryErrorHandler = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : 'An unexpected error occurred';

  // Only show error toast for non-401 errors (401 is handled by auth)
  if (error instanceof Error && !error.message.includes('401')) {
    toast.error(message);
  }

  console.error('[React Query Error]:', error);
};

// Default query options
const defaultQueryOptions: DefaultOptions['queries'] = {
  staleTime: 1000 * 60 * 5, // 5 minutes
  gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
  refetchOnWindowFocus: false,
  refetchOnReconnect: 'always',
  retry: (failureCount, error) => {
    // Don't retry on 4xx errors
    if (error instanceof Error && error.message.includes('4')) {
      return false;
    }
    // Retry up to 3 times for other errors
    return failureCount < 3;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
};

// Default mutation options
const defaultMutationOptions: DefaultOptions['mutations'] = {
  onError: queryErrorHandler,
  retry: 1,
  retryDelay: 1000,
};

// Create the query client with optimized settings
export const createQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: defaultQueryOptions,
      mutations: defaultMutationOptions,
    },
  });
};

// Query cache utilities
export const queryCache = {
  // Invalidate all queries with a specific key prefix
  invalidatePrefix: async (client: QueryClient, prefix: string[]) => {
    await client.invalidateQueries({
      predicate: (query) => {
        const queryKey = query.queryKey as string[];
        return prefix.every((key, index) => queryKey[index] === key);
      }
    });
  },

  // Remove all queries with a specific key prefix
  removePrefix: (client: QueryClient, prefix: string[]) => {
    client.removeQueries({
      predicate: (query) => {
        const queryKey = query.queryKey as string[];
        return prefix.every((key, index) => queryKey[index] === key);
      }
    });
  },

  // Prefetch data and cache it
  prefetch: async <T>(
    client: QueryClient,
    queryKey: unknown[],
    queryFn: () => Promise<T>,
    staleTime?: number
  ) => {
    await client.prefetchQuery({
      queryKey,
      queryFn,
      staleTime: staleTime || defaultQueryOptions.staleTime,
    });
  },

  // Set query data optimistically
  setOptimistic: <T>(
    client: QueryClient,
    queryKey: unknown[],
    updater: (old: T | undefined) => T
  ) => {
    client.setQueryData(queryKey, updater);
  },
};

// Stale time presets for different data types
export const STALE_TIME = {
  INSTANT: 0, // Always fetch fresh
  FREQUENT: 1000 * 30, // 30 seconds
  NORMAL: 1000 * 60 * 5, // 5 minutes
  MODERATE: 1000 * 60 * 15, // 15 minutes
  INFREQUENT: 1000 * 60 * 60, // 1 hour
  STATIC: 1000 * 60 * 60 * 24, // 24 hours
} as const;

// Cache time presets
export const CACHE_TIME = {
  SHORT: 1000 * 60 * 5, // 5 minutes
  MEDIUM: 1000 * 60 * 30, // 30 minutes
  LONG: 1000 * 60 * 60 * 2, // 2 hours
  EXTENDED: 1000 * 60 * 60 * 24, // 24 hours
} as const;

// Refetch interval presets for real-time-like updates
export const REFETCH_INTERVAL = {
  REALTIME: 1000 * 2, // 2 seconds
  FREQUENT: 1000 * 10, // 10 seconds
  MODERATE: 1000 * 30, // 30 seconds
  OCCASIONAL: 1000 * 60, // 1 minute
} as const;

// Query key factory patterns
export const createQueryKeys = <T extends Record<string, any>>(
  namespace: string
) => {
  return {
    all: [namespace] as const,
    lists: () => [...[namespace], 'list'] as const,
    list: (filters?: T) => [...[namespace], 'list', filters] as const,
    details: () => [...[namespace], 'detail'] as const,
    detail: (id: string) => [...[namespace], 'detail', id] as const,
    search: (query: string) => [...[namespace], 'search', query] as const,
    infinite: (filters?: T) => [...[namespace], 'infinite', filters] as const,
  };
};

// Mutation key factory
export const createMutationKeys = (namespace: string) => {
  return {
    create: [namespace, 'create'] as const,
    update: [namespace, 'update'] as const,
    delete: [namespace, 'delete'] as const,
    patch: [namespace, 'patch'] as const,
  };
};

// Export singleton query client
let queryClient: QueryClient | null = null;

export const getQueryClient = () => {
  if (!queryClient) {
    queryClient = createQueryClient();
  }
  return queryClient;
};
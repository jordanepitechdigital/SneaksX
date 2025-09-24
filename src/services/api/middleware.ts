/**
 * API Middleware and Interceptors
 * Handles authentication, caching, error handling, and request/response processing
 */

import { authService } from './auth';
import type { UserRole, Permission } from '@/types/auth';

/**
 * Request interceptor for adding authentication headers
 */
export async function authInterceptor(config: RequestInit): Promise<RequestInit> {
  try {
    const session = await authService.getSession();

    if (session?.access_token) {
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${session.access_token}`,
        'X-User-Role': authService.hasRole('admin') ? 'admin' :
                       authService.hasRole('vendor') ? 'vendor' : 'user',
      };
    }
  } catch (error) {
    console.error('[Middleware] Auth interceptor error:', error);
  }

  return config;
}

/**
 * Response interceptor for handling auth errors
 */
export async function responseInterceptor(response: Response): Promise<Response> {
  // Handle unauthorized responses
  if (response.status === 401) {
    console.warn('[Middleware] Unauthorized response, attempting token refresh');

    const refreshed = await authService.refreshSession();

    if (!refreshed) {
      // Session expired, redirect to login
      await authService.logout();
      if (typeof window !== 'undefined') {
        window.location.href = '/login?expired=true';
      }
    }
  }

  // Handle forbidden responses
  if (response.status === 403) {
    console.error('[Middleware] Forbidden: Insufficient permissions');
    throw new Error('You do not have permission to perform this action');
  }

  return response;
}

/**
 * Route guard middleware for protecting pages
 */
export interface RouteGuardOptions {
  requiredRole?: UserRole | UserRole[];
  requiredPermission?: Permission | Permission[];
  redirectTo?: string;
  allowGuest?: boolean;
}

export async function routeGuard(options: RouteGuardOptions = {}): Promise<boolean> {
  const {
    requiredRole,
    requiredPermission,
    redirectTo = '/login',
    allowGuest = false,
  } = options;

  // Check authentication
  const user = await authService.getCurrentUser();

  if (!user && !allowGuest) {
    if (typeof window !== 'undefined') {
      window.location.href = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname)}`;
    }
    return false;
  }

  // Check role requirements
  if (requiredRole && !authService.hasRole(requiredRole)) {
    console.error('[Middleware] Insufficient role:', { required: requiredRole, current: user?.role });
    if (typeof window !== 'undefined') {
      window.location.href = '/403';
    }
    return false;
  }

  // Check permission requirements
  if (requiredPermission && !authService.hasPermission(requiredPermission)) {
    console.error('[Middleware] Insufficient permission:', requiredPermission);
    if (typeof window !== 'undefined') {
      window.location.href = '/403';
    }
    return false;
  }

  return true;
}

/**
 * API request wrapper with middleware
 */
export async function apiRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  try {
    // Apply auth interceptor
    const config = await authInterceptor(options);

    // Add default headers
    config.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    // Make request
    const response = await fetch(url, config);

    // Apply response interceptor
    return await responseInterceptor(response);
  } catch (error) {
    console.error('[Middleware] API request error:', error);
    throw error;
  }
}

/**
 * Retry middleware for failed requests
 */
export async function retryMiddleware(
  request: () => Promise<Response>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await request();

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on server errors (5xx) or network errors
      if (response.ok) {
        return response;
      }

      throw new Error(`Request failed with status: ${response.status}`);
    } catch (error) {
      lastError = error as Error;
      console.warn(`[Middleware] Retry attempt ${i + 1}/${maxRetries} failed:`, error);

      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Cache middleware for GET requests
 */
const requestCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function cacheMiddleware(
  key: string,
  request: () => Promise<any>,
  duration: number = CACHE_DURATION
): Promise<any> {
  // Check cache
  const cached = requestCache.get(key);

  if (cached && Date.now() - cached.timestamp < duration) {
    console.log('[Middleware] Cache hit:', key);
    return Promise.resolve(cached.data);
  }

  // Make request and cache result
  return request().then(data => {
    requestCache.set(key, { data, timestamp: Date.now() });

    // Clean old cache entries
    if (requestCache.size > 100) {
      const now = Date.now();
      for (const [k, v] of requestCache.entries()) {
        if (now - v.timestamp > duration) {
          requestCache.delete(k);
        }
      }
    }

    return data;
  });
}

/**
 * Rate limiting middleware
 */
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

export function rateLimitMiddleware(
  identifier: string = 'global',
  maxRequests: number = RATE_LIMIT_MAX,
  window: number = RATE_LIMIT_WINDOW
): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(identifier) || [];

  // Remove old requests outside the window
  const validRequests = requests.filter(time => now - time < window);

  if (validRequests.length >= maxRequests) {
    console.warn('[Middleware] Rate limit exceeded:', identifier);
    return false;
  }

  validRequests.push(now);
  rateLimitMap.set(identifier, validRequests);

  return true;
}

/**
 * Logging middleware for debugging
 */
export function loggingMiddleware(
  request: string,
  response: any,
  duration: number
): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('[API Request]', {
      request,
      duration: `${duration}ms`,
      response: response?.status || 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Error boundary middleware
 */
export async function errorBoundary<T>(
  operation: () => Promise<T>,
  fallback?: T,
  onError?: (error: Error) => void
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error('[Middleware] Error boundary caught:', error);
    onError?.(error as Error);

    if (fallback !== undefined) {
      return fallback;
    }

    throw error;
  }
}

/**
 * Batch request middleware
 */
export class BatchRequestManager {
  private queue: Map<string, Promise<any>> = new Map();
  private batchTimeout: NodeJS.Timeout | null = null;
  private batchSize = 10;
  private batchDelay = 50;

  constructor(batchSize: number = 10, batchDelay: number = 50) {
    this.batchSize = batchSize;
    this.batchDelay = batchDelay;
  }

  async add<T>(
    key: string,
    request: () => Promise<T>
  ): Promise<T> {
    // Check if request is already in queue
    if (this.queue.has(key)) {
      return this.queue.get(key) as Promise<T>;
    }

    // Add to queue
    const promise = this.processBatch(key, request);
    this.queue.set(key, promise);

    return promise;
  }

  private async processBatch<T>(
    key: string,
    request: () => Promise<T>
  ): Promise<T> {
    // Wait for batch delay
    await new Promise(resolve => setTimeout(resolve, this.batchDelay));

    try {
      const result = await request();
      return result;
    } finally {
      this.queue.delete(key);
    }
  }
}

// Export singleton batch manager
export const batchManager = new BatchRequestManager();

/**
 * Transform middleware for request/response data
 */
export function transformMiddleware<T, R>(
  transformer: (data: T) => R
): (data: T) => R {
  return (data: T) => {
    try {
      return transformer(data);
    } catch (error) {
      console.error('[Middleware] Transform error:', error);
      throw error;
    }
  };
}

/**
 * Validation middleware
 */
export function validationMiddleware<T>(
  validator: (data: T) => boolean | string,
  errorMessage: string = 'Validation failed'
): (data: T) => T {
  return (data: T) => {
    const result = validator(data);

    if (result === true) {
      return data;
    }

    const message = typeof result === 'string' ? result : errorMessage;
    throw new Error(message);
  };
}

/**
 * Compose multiple middleware functions
 */
export function compose<T>(
  ...middlewares: Array<(data: T) => T | Promise<T>>
): (data: T) => Promise<T> {
  return async (data: T) => {
    let result = data;

    for (const middleware of middlewares) {
      result = await middleware(result);
    }

    return result;
  };
}
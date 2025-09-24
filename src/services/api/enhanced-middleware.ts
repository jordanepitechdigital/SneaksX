/**
 * Enhanced API Middleware Service
 * Integrates comprehensive error handling, loading states, and recovery strategies
 */

import { AppError, ErrorType, ErrorSeverity, RecoveryStrategy, ErrorReporter } from './error-types'
import { authService } from './auth'
import type { LoadingContextType } from '@/contexts/LoadingContext'

export interface MiddlewareConfig {
  maxRetries?: number
  baseRetryDelay?: number
  maxRetryDelay?: number
  timeout?: number
  enableLogging?: boolean
  enableErrorReporting?: boolean
  loadingContext?: LoadingContextType
}

export interface RequestContext {
  endpoint: string
  method: string
  startTime: number
  requestId: string
  retryCount: number
  loadingKey?: string
}

export class EnhancedMiddlewareService {
  private config: Required<MiddlewareConfig>
  private activeRequests: Map<string, RequestContext> = new Map()
  private requestIdCounter = 0

  constructor(config: MiddlewareConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      baseRetryDelay: config.baseRetryDelay ?? 1000,
      maxRetryDelay: config.maxRetryDelay ?? 30000,
      timeout: config.timeout ?? 30000,
      enableLogging: config.enableLogging ?? process.env.NODE_ENV === 'development',
      enableErrorReporting: config.enableErrorReporting ?? process.env.NODE_ENV === 'production',
      loadingContext: config.loadingContext ?? null
    }
  }

  /**
   * Enhanced API request with comprehensive error handling and recovery
   */
  public async makeRequest<T>(
    url: string,
    options: RequestInit = {},
    loadingKey?: string
  ): Promise<T> {
    const requestId = this.generateRequestId()
    const context: RequestContext = {
      endpoint: url,
      method: options.method || 'GET',
      startTime: Date.now(),
      requestId,
      retryCount: 0,
      loadingKey
    }

    this.activeRequests.set(requestId, context)

    try {
      // Start loading if context provided
      if (loadingKey && this.config.loadingContext) {
        this.config.loadingContext.startLoading(loadingKey, `Loading ${url}...`)
      }

      const result = await this.executeRequestWithRetry<T>(url, options, context)
      return result
    } finally {
      // Stop loading
      if (loadingKey && this.config.loadingContext) {
        this.config.loadingContext.stopLoading(loadingKey)
      }

      this.activeRequests.delete(requestId)
    }
  }

  /**
   * Execute request with automatic retry and error recovery
   */
  private async executeRequestWithRetry<T>(
    url: string,
    options: RequestInit,
    context: RequestContext
  ): Promise<T> {
    let lastError: AppError | null = null

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        context.retryCount = attempt

        // Update loading message for retries
        if (attempt > 0 && context.loadingKey && this.config.loadingContext) {
          this.config.loadingContext.setMessage(
            context.loadingKey,
            `Retrying... (${attempt}/${this.config.maxRetries})`
          )
        }

        const response = await this.executeSingleRequest(url, options, context)
        const result = await this.processResponse<T>(response, context)

        // Log success
        if (this.config.enableLogging) {
          const duration = Date.now() - context.startTime
          console.log(`[API Success] ${context.method} ${context.endpoint} (${duration}ms)`)
        }

        return result
      } catch (error) {
        lastError = this.handleRequestError(error, context)

        // Check if we should retry
        const shouldRetry = this.shouldRetryRequest(lastError, attempt)

        if (shouldRetry && attempt < this.config.maxRetries) {
          const delay = this.calculateRetryDelay(attempt)

          if (this.config.enableLogging) {
            console.warn(
              `[API Retry] ${context.method} ${context.endpoint} - Attempt ${attempt + 1}/${this.config.maxRetries + 1} failed, retrying in ${delay}ms`,
              lastError.type
            )
          }

          await this.sleep(delay)
          continue
        }

        // No more retries, handle final error
        await this.handleFinalError(lastError, context)
        throw lastError
      }
    }

    throw lastError || new AppError(
      'Maximum retry attempts exceeded',
      ErrorType.UNKNOWN_ERROR,
      ErrorSeverity.HIGH,
      RecoveryStrategy.USER_ACTION
    )
  }

  /**
   * Execute a single HTTP request with timeouts and auth
   */
  private async executeSingleRequest(
    url: string,
    options: RequestInit,
    context: RequestContext
  ): Promise<Response> {
    // Apply auth interceptor
    const authenticatedOptions = await this.applyAuthInterceptor(options)

    // Add request metadata
    const requestOptions: RequestInit = {
      ...authenticatedOptions,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': context.requestId,
        'X-Request-Time': context.startTime.toString(),
        ...authenticatedOptions.headers,
      }
    }

    // Create timeout controller
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * Process and validate response
   */
  private async processResponse<T>(response: Response, context: RequestContext): Promise<T> {
    // Check for HTTP errors
    if (!response.ok) {
      throw AppError.fromHttpResponse(response, context.endpoint, context.method)
    }

    try {
      const data = await response.json()
      return data as T
    } catch (error) {
      throw new AppError(
        'Failed to parse response JSON',
        ErrorType.INVALID_FORMAT,
        ErrorSeverity.MEDIUM,
        RecoveryStrategy.RETRY,
        'Server returned invalid data format',
        {
          endpoint: context.endpoint,
          method: context.method,
          statusCode: response.status,
          responseBody: await response.text().catch(() => 'Unable to read response')
        }
      )
    }
  }

  /**
   * Handle and classify request errors
   */
  private handleRequestError(error: unknown, context: RequestContext): AppError {
    if (error instanceof AppError) {
      return error.increaseRetryCount()
    }

    const originalError = error as Error

    // Network/timeout errors
    if (originalError.name === 'AbortError') {
      return new AppError(
        'Request timeout',
        ErrorType.CONNECTION_TIMEOUT,
        ErrorSeverity.MEDIUM,
        RecoveryStrategy.RETRY_WITH_BACKOFF,
        'Request timed out. Please try again.',
        {
          endpoint: context.endpoint,
          method: context.method,
          timeout: this.config.timeout,
          stackTrace: originalError.stack
        },
        context.retryCount
      )
    }

    // Network errors
    if (originalError.message?.toLowerCase().includes('fetch')) {
      return AppError.fromNetworkError(originalError, context.endpoint)
    }

    // Generic error
    return new AppError(
      originalError.message || 'Unknown error occurred',
      ErrorType.UNKNOWN_ERROR,
      ErrorSeverity.MEDIUM,
      RecoveryStrategy.USER_ACTION,
      'An unexpected error occurred',
      {
        endpoint: context.endpoint,
        method: context.method,
        stackTrace: originalError.stack
      },
      context.retryCount
    )
  }

  /**
   * Handle final error after all retry attempts
   */
  private async handleFinalError(error: AppError, context: RequestContext): Promise<void> {
    const duration = Date.now() - context.startTime

    // Log error
    if (this.config.enableLogging) {
      console.error(
        `[API Error] ${context.method} ${context.endpoint} (${duration}ms)`,
        {
          type: error.type,
          severity: error.severity,
          retries: error.retryCount,
          message: error.message,
          userMessage: error.userMessage
        }
      )
    }

    // Report error
    if (this.config.enableErrorReporting) {
      ErrorReporter.report(error, {
        url: context.endpoint,
        action: context.method,
        component: 'EnhancedMiddlewareService'
      })
    }

    // Execute recovery strategy
    await this.executeRecoveryStrategy(error, context)
  }

  /**
   * Execute appropriate recovery strategy
   */
  private async executeRecoveryStrategy(error: AppError, context: RequestContext): Promise<void> {
    switch (error.recoveryStrategy) {
      case RecoveryStrategy.REFRESH_TOKEN:
        try {
          console.log('[Recovery] Attempting token refresh...')
          const refreshed = await authService.refreshSession()
          if (refreshed) {
            console.log('[Recovery] Token refreshed successfully')
          } else {
            console.warn('[Recovery] Token refresh failed, redirecting to login')
            await this.redirectToLogin()
          }
        } catch (refreshError) {
          console.error('[Recovery] Token refresh error:', refreshError)
          await this.redirectToLogin()
        }
        break

      case RecoveryStrategy.REDIRECT:
        if (error.type === ErrorType.FORBIDDEN) {
          await this.redirectToForbidden()
        } else if (error.type === ErrorType.UNAUTHORIZED) {
          await this.redirectToLogin()
        }
        break

      case RecoveryStrategy.ESCALATE:
        // This would integrate with error monitoring service
        console.error('[Recovery] Escalating error to monitoring service:', error.toJSON())
        break

      // Other strategies are handled by the calling code
      case RecoveryStrategy.RETRY:
      case RecoveryStrategy.RETRY_WITH_BACKOFF:
      case RecoveryStrategy.FALLBACK:
      case RecoveryStrategy.USER_ACTION:
      case RecoveryStrategy.IGNORE:
      default:
        // No automatic recovery
        break
    }
  }

  /**
   * Determine if request should be retried
   */
  private shouldRetryRequest(error: AppError, attempt: number): boolean {
    if (attempt >= this.config.maxRetries) return false

    return error.recoveryStrategy === RecoveryStrategy.RETRY ||
           error.recoveryStrategy === RecoveryStrategy.RETRY_WITH_BACKOFF ||
           error.recoveryStrategy === RecoveryStrategy.REFRESH_TOKEN
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = this.config.baseRetryDelay * Math.pow(2, attempt)
    return Math.min(delay, this.config.maxRetryDelay)
  }

  /**
   * Apply authentication interceptor
   */
  private async applyAuthInterceptor(options: RequestInit): Promise<RequestInit> {
    try {
      const session = await authService.getSession()

      if (session?.access_token) {
        return {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${session.access_token}`,
            'X-User-Role': authService.hasRole('admin') ? 'admin' :
                          authService.hasRole('vendor') ? 'vendor' : 'user'
          }
        }
      }
    } catch (error) {
      console.warn('[Middleware] Auth interceptor warning:', error)
    }

    return options
  }

  /**
   * Redirect to login page
   */
  private async redirectToLogin(): Promise<void> {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname
      const redirectUrl = `/login?redirect=${encodeURIComponent(currentPath)}&expired=true`
      window.location.href = redirectUrl
    }
  }

  /**
   * Redirect to forbidden page
   */
  private async redirectToForbidden(): Promise<void> {
    if (typeof window !== 'undefined') {
      window.location.href = '/403'
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestIdCounter}`
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get active request statistics
   */
  public getActiveRequestStats(): {
    activeRequests: number
    averageResponseTime: number
    requestsByEndpoint: Record<string, number>
  } {
    const requests = Array.from(this.activeRequests.values())
    const now = Date.now()

    return {
      activeRequests: requests.length,
      averageResponseTime: requests.length > 0
        ? requests.reduce((sum, req) => sum + (now - req.startTime), 0) / requests.length
        : 0,
      requestsByEndpoint: requests.reduce((acc, req) => {
        acc[req.endpoint] = (acc[req.endpoint] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    }
  }

  /**
   * Cancel all active requests
   */
  public cancelAllRequests(): void {
    this.activeRequests.clear()
  }
}

// Export singleton instance
export const enhancedMiddleware = new EnhancedMiddlewareService()

// Export factory function for custom configurations
export const createEnhancedMiddleware = (config: MiddlewareConfig) =>
  new EnhancedMiddlewareService(config)

// Convenience wrapper for common API operations
export class ApiClient {
  constructor(
    private baseURL: string = '',
    private middleware: EnhancedMiddlewareService = enhancedMiddleware
  ) {}

  async get<T>(endpoint: string, loadingKey?: string): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    return this.middleware.makeRequest<T>(url, { method: 'GET' }, loadingKey)
  }

  async post<T>(endpoint: string, data?: any, loadingKey?: string): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    return this.middleware.makeRequest<T>(
      url,
      {
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined
      },
      loadingKey
    )
  }

  async put<T>(endpoint: string, data?: any, loadingKey?: string): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    return this.middleware.makeRequest<T>(
      url,
      {
        method: 'PUT',
        body: data ? JSON.stringify(data) : undefined
      },
      loadingKey
    )
  }

  async delete<T>(endpoint: string, loadingKey?: string): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    return this.middleware.makeRequest<T>(url, { method: 'DELETE' }, loadingKey)
  }
}

// Default API client
export const apiClient = new ApiClient()

// Utility hooks for React components
export const useApiRequest = () => {
  return {
    get: <T>(endpoint: string, loadingKey?: string) => apiClient.get<T>(endpoint, loadingKey),
    post: <T>(endpoint: string, data?: any, loadingKey?: string) => apiClient.post<T>(endpoint, data, loadingKey),
    put: <T>(endpoint: string, data?: any, loadingKey?: string) => apiClient.put<T>(endpoint, data, loadingKey),
    delete: <T>(endpoint: string, loadingKey?: string) => apiClient.delete<T>(endpoint, loadingKey),
  }
}
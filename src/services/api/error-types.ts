/**
 * Centralized Error Types and Handling
 * Provides comprehensive error classification and recovery strategies
 */

export enum ErrorType {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',

  // HTTP errors
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Business logic errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // Authentication/Authorization errors
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_REFRESH_FAILED = 'TOKEN_REFRESH_FAILED',

  // Data errors
  DATA_CORRUPTION = 'DATA_CORRUPTION',
  INVALID_FORMAT = 'INVALID_FORMAT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // External service errors
  THIRD_PARTY_SERVICE_ERROR = 'THIRD_PARTY_SERVICE_ERROR',
  PAYMENT_PROCESSOR_ERROR = 'PAYMENT_PROCESSOR_ERROR',
  EMAIL_SERVICE_ERROR = 'EMAIL_SERVICE_ERROR',

  // Client-side errors
  BROWSER_NOT_SUPPORTED = 'BROWSER_NOT_SUPPORTED',
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  OFFLINE = 'OFFLINE',

  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export enum ErrorSeverity {
  LOW = 'LOW',         // Informational, doesn't block user workflow
  MEDIUM = 'MEDIUM',   // Warning, may impact some functionality
  HIGH = 'HIGH',       // Error, blocks current operation
  CRITICAL = 'CRITICAL' // Critical, application-breaking
}

export enum RecoveryStrategy {
  RETRY = 'RETRY',                   // Automatically retry the operation
  RETRY_WITH_BACKOFF = 'RETRY_WITH_BACKOFF', // Retry with exponential backoff
  REFRESH_TOKEN = 'REFRESH_TOKEN',   // Refresh auth token and retry
  FALLBACK = 'FALLBACK',            // Use cached or fallback data
  USER_ACTION = 'USER_ACTION',      // Require user intervention
  REDIRECT = 'REDIRECT',            // Redirect user to different page
  IGNORE = 'IGNORE',                // Log but don't interrupt user
  ESCALATE = 'ESCALATE',            // Report to error monitoring service
}

export interface ErrorMetadata {
  timestamp: string
  userAgent?: string
  userId?: string
  sessionId?: string
  requestId?: string
  endpoint?: string
  method?: string
  statusCode?: number
  responseBody?: any
  stackTrace?: string
  context?: Record<string, any>
}

export class AppError extends Error {
  public readonly type: ErrorType
  public readonly severity: ErrorSeverity
  public readonly recoveryStrategy: RecoveryStrategy
  public readonly metadata: ErrorMetadata
  public readonly userMessage: string
  public readonly isRetryable: boolean
  public readonly retryCount: number

  constructor(
    message: string,
    type: ErrorType,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    recoveryStrategy: RecoveryStrategy = RecoveryStrategy.USER_ACTION,
    userMessage?: string,
    metadata: Partial<ErrorMetadata> = {},
    retryCount: number = 0
  ) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.severity = severity
    this.recoveryStrategy = recoveryStrategy
    this.userMessage = userMessage || this.getDefaultUserMessage(type)
    this.isRetryable = this.getRetryability(recoveryStrategy)
    this.retryCount = retryCount
    this.metadata = {
      timestamp: new Date().toISOString(),
      ...metadata
    }

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
  }

  private getDefaultUserMessage(type: ErrorType): string {
    const messages: Record<ErrorType, string> = {
      [ErrorType.NETWORK_ERROR]: 'Connection problem. Please check your internet and try again.',
      [ErrorType.CONNECTION_TIMEOUT]: 'Request timed out. Please try again.',
      [ErrorType.CONNECTION_REFUSED]: 'Unable to connect to server. Please try again later.',

      [ErrorType.BAD_REQUEST]: 'Invalid request. Please check your input and try again.',
      [ErrorType.UNAUTHORIZED]: 'You need to log in to access this feature.',
      [ErrorType.FORBIDDEN]: 'You don\'t have permission to perform this action.',
      [ErrorType.NOT_FOUND]: 'The requested resource was not found.',
      [ErrorType.CONFLICT]: 'This action conflicts with current data. Please refresh and try again.',
      [ErrorType.RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
      [ErrorType.INTERNAL_SERVER_ERROR]: 'Server error. Our team has been notified.',
      [ErrorType.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again later.',

      [ErrorType.VALIDATION_ERROR]: 'Please check your input and try again.',
      [ErrorType.BUSINESS_RULE_VIOLATION]: 'This action violates business rules.',
      [ErrorType.INSUFFICIENT_PERMISSIONS]: 'You don\'t have permission for this action.',
      [ErrorType.RESOURCE_NOT_FOUND]: 'The requested item was not found.',
      [ErrorType.QUOTA_EXCEEDED]: 'Usage quota exceeded. Please upgrade your plan.',

      [ErrorType.SESSION_EXPIRED]: 'Your session has expired. Please log in again.',
      [ErrorType.INVALID_CREDENTIALS]: 'Invalid username or password.',
      [ErrorType.TOKEN_REFRESH_FAILED]: 'Session refresh failed. Please log in again.',

      [ErrorType.DATA_CORRUPTION]: 'Data integrity issue detected. Please contact support.',
      [ErrorType.INVALID_FORMAT]: 'Invalid data format. Please check your input.',
      [ErrorType.MISSING_REQUIRED_FIELD]: 'Required information is missing.',

      [ErrorType.THIRD_PARTY_SERVICE_ERROR]: 'External service error. Please try again later.',
      [ErrorType.PAYMENT_PROCESSOR_ERROR]: 'Payment processing error. Please try a different method.',
      [ErrorType.EMAIL_SERVICE_ERROR]: 'Email service error. Please try again later.',

      [ErrorType.BROWSER_NOT_SUPPORTED]: 'Your browser is not supported. Please use a modern browser.',
      [ErrorType.STORAGE_QUOTA_EXCEEDED]: 'Storage quota exceeded. Please clear some data.',
      [ErrorType.OFFLINE]: 'You\'re offline. Please check your connection.',

      [ErrorType.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
    }

    return messages[type] || 'An error occurred. Please try again.'
  }

  private getRetryability(strategy: RecoveryStrategy): boolean {
    return [
      RecoveryStrategy.RETRY,
      RecoveryStrategy.RETRY_WITH_BACKOFF,
      RecoveryStrategy.REFRESH_TOKEN
    ].includes(strategy)
  }

  public static fromHttpResponse(
    response: Response,
    endpoint?: string,
    method?: string
  ): AppError {
    const statusCode = response.status
    const metadata: Partial<ErrorMetadata> = {
      endpoint,
      method,
      statusCode
    }

    switch (statusCode) {
      case 400:
        return new AppError(
          'Bad Request',
          ErrorType.BAD_REQUEST,
          ErrorSeverity.MEDIUM,
          RecoveryStrategy.USER_ACTION,
          undefined,
          metadata
        )
      case 401:
        return new AppError(
          'Unauthorized',
          ErrorType.UNAUTHORIZED,
          ErrorSeverity.HIGH,
          RecoveryStrategy.REFRESH_TOKEN,
          undefined,
          metadata
        )
      case 403:
        return new AppError(
          'Forbidden',
          ErrorType.FORBIDDEN,
          ErrorSeverity.HIGH,
          RecoveryStrategy.REDIRECT,
          undefined,
          metadata
        )
      case 404:
        return new AppError(
          'Not Found',
          ErrorType.NOT_FOUND,
          ErrorSeverity.MEDIUM,
          RecoveryStrategy.FALLBACK,
          undefined,
          metadata
        )
      case 409:
        return new AppError(
          'Conflict',
          ErrorType.CONFLICT,
          ErrorSeverity.MEDIUM,
          RecoveryStrategy.USER_ACTION,
          undefined,
          metadata
        )
      case 429:
        return new AppError(
          'Rate Limited',
          ErrorType.RATE_LIMITED,
          ErrorSeverity.MEDIUM,
          RecoveryStrategy.RETRY_WITH_BACKOFF,
          undefined,
          metadata
        )
      case 500:
        return new AppError(
          'Internal Server Error',
          ErrorType.INTERNAL_SERVER_ERROR,
          ErrorSeverity.HIGH,
          RecoveryStrategy.RETRY_WITH_BACKOFF,
          undefined,
          metadata
        )
      case 503:
        return new AppError(
          'Service Unavailable',
          ErrorType.SERVICE_UNAVAILABLE,
          ErrorSeverity.HIGH,
          RecoveryStrategy.RETRY_WITH_BACKOFF,
          undefined,
          metadata
        )
      default:
        return new AppError(
          `HTTP ${statusCode}`,
          ErrorType.UNKNOWN_ERROR,
          ErrorSeverity.MEDIUM,
          RecoveryStrategy.USER_ACTION,
          undefined,
          metadata
        )
    }
  }

  public static fromNetworkError(error: Error, endpoint?: string): AppError {
    const message = error.message.toLowerCase()

    if (message.includes('timeout')) {
      return new AppError(
        'Connection Timeout',
        ErrorType.CONNECTION_TIMEOUT,
        ErrorSeverity.MEDIUM,
        RecoveryStrategy.RETRY_WITH_BACKOFF,
        undefined,
        { endpoint, stackTrace: error.stack }
      )
    }

    if (message.includes('network') || message.includes('fetch')) {
      return new AppError(
        'Network Error',
        ErrorType.NETWORK_ERROR,
        ErrorSeverity.HIGH,
        RecoveryStrategy.RETRY_WITH_BACKOFF,
        undefined,
        { endpoint, stackTrace: error.stack }
      )
    }

    return new AppError(
      error.message,
      ErrorType.UNKNOWN_ERROR,
      ErrorSeverity.MEDIUM,
      RecoveryStrategy.USER_ACTION,
      undefined,
      { endpoint, stackTrace: error.stack }
    )
  }

  public increaseRetryCount(): AppError {
    return new AppError(
      this.message,
      this.type,
      this.severity,
      this.recoveryStrategy,
      this.userMessage,
      this.metadata,
      this.retryCount + 1
    )
  }

  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      userMessage: this.userMessage,
      isRetryable: this.isRetryable,
      retryCount: this.retryCount,
      metadata: this.metadata
    }
  }
}

// Error reporting utilities
export interface ErrorReport {
  error: AppError
  context: {
    url: string
    component?: string
    action?: string
    userId?: string
    sessionId?: string
  }
}

export class ErrorReporter {
  private static reports: ErrorReport[] = []
  private static maxReports = 100

  public static report(error: AppError, context: Partial<ErrorReport['context']> = {}): void {
    const report: ErrorReport = {
      error,
      context: {
        url: typeof window !== 'undefined' ? window.location.href : '',
        ...context
      }
    }

    this.reports.push(report)

    // Keep only recent reports
    if (this.reports.length > this.maxReports) {
      this.reports = this.reports.slice(-this.maxReports)
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Report:', report)
    }

    // Send to monitoring service in production
    if (process.env.NODE_ENV === 'production' && error.severity === ErrorSeverity.CRITICAL) {
      this.sendToMonitoring(report)
    }
  }

  public static getReports(): ErrorReport[] {
    return [...this.reports]
  }

  public static clearReports(): void {
    this.reports = []
  }

  private static async sendToMonitoring(report: ErrorReport): Promise<void> {
    try {
      // This would integrate with services like Sentry, LogRocket, etc.
      console.log('Sending error to monitoring service:', report)
      // await fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(report)
      // })
    } catch (error) {
      console.error('Failed to send error report:', error)
    }
  }
}

// Utility functions for error handling
export function isRetryableError(error: Error): boolean {
  return error instanceof AppError ? error.isRetryable : false
}

export function getErrorSeverity(error: Error): ErrorSeverity {
  return error instanceof AppError ? error.severity : ErrorSeverity.MEDIUM
}

export function getUserFriendlyMessage(error: Error): string {
  return error instanceof AppError ? error.userMessage : 'An unexpected error occurred'
}

export function shouldShowToUser(error: Error): boolean {
  if (!(error instanceof AppError)) return true

  return error.severity !== ErrorSeverity.LOW &&
         error.recoveryStrategy !== RecoveryStrategy.IGNORE
}
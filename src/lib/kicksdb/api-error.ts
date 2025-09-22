/**
 * Custom error classes for KicksDB API
 */
export class KicksDBAPIError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: any;

  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    statusCode?: number,
    details?: any
  ) {
    super(message);
    this.name = 'KicksDBAPIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class RateLimitError extends KicksDBAPIError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super(
      `Rate limit exceeded. Retry after ${retryAfter} seconds`,
      'RATE_LIMIT_EXCEEDED',
      429
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class AuthenticationError extends KicksDBAPIError {
  constructor(message: string = 'Invalid API key') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class NetworkError extends KicksDBAPIError {
  constructor(message: string, originalError?: Error) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
    this.details = originalError;
  }
}

export class ValidationError extends KicksDBAPIError {
  constructor(message: string, validationDetails?: any) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.details = validationDetails;
  }
}

/**
 * Determine error type from HTTP response
 */
export function createErrorFromResponse(
  status: number,
  message: string,
  response?: any
): KicksDBAPIError {
  switch (status) {
    case 401:
      return new AuthenticationError(message);
    case 429:
      const retryAfter = response?.headers?.['retry-after']
        ? parseInt(response.headers['retry-after'])
        : 60;
      return new RateLimitError(retryAfter);
    case 400:
      return new ValidationError(message, response?.data);
    case 404:
      return new KicksDBAPIError(message, 'NOT_FOUND', status);
    case 500:
    case 502:
    case 503:
    case 504:
      return new KicksDBAPIError(message, 'SERVER_ERROR', status);
    default:
      return new KicksDBAPIError(message, 'HTTP_ERROR', status);
  }
}
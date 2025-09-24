/**
 * React Query Error Boundary
 * Handles errors from React Query operations with retry capabilities
 */

'use client';

import React, { Component, ReactNode } from 'react';
import { QueryErrorResetBoundary, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, RefreshCw, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  isolate?: boolean; // Whether to isolate this boundary from parent boundaries
}

class ErrorBoundaryComponent extends Component<
  ErrorBoundaryProps & { resetKeys?: Array<unknown>; onReset?: () => void },
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps & { resetKeys?: Array<unknown>; onReset?: () => void }) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to monitoring service
    console.error('Error Boundary caught:', error, errorInfo);

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // Show error toast for non-critical errors
    if (!this.props.isolate) {
      toast.error('Something went wrong. Please try again.');
    }
  }

  componentDidUpdate(
    prevProps: ErrorBoundaryProps & { resetKeys?: Array<unknown> },
    prevState: ErrorBoundaryState
  ) {
    const { resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error boundary when resetKeys change
    if (
      hasError &&
      prevState.hasError &&
      resetKeys &&
      prevProps.resetKeys &&
      resetKeys.some((key, idx) => key !== prevProps.resetKeys?.[idx])
    ) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = () => {
    this.props.onReset?.();
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: this.state.retryCount + 1,
    });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return <>{fallback(error, this.resetErrorBoundary)}</>;
      }

      // Default error UI
      return <DefaultErrorFallback error={error} retry={this.resetErrorBoundary} />;
    }

    return children;
  }
}

/**
 * Default error fallback UI
 */
function DefaultErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  const router = useRouter();
  const isNetworkError = error.message.toLowerCase().includes('network') ||
                        error.message.toLowerCase().includes('fetch');
  const is404Error = error.message.includes('404');
  const isAuthError = error.message.toLowerCase().includes('auth') ||
                      error.message.includes('401');

  return (
    <div className="flex min-h-[400px] items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Error Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>

        {/* Error Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">
            {is404Error ? 'Not Found' :
             isAuthError ? 'Authentication Required' :
             isNetworkError ? 'Connection Problem' :
             'Something went wrong'}
          </h2>
          <p className="text-gray-600">
            {is404Error ? 'The requested resource could not be found.' :
             isAuthError ? 'Please log in to continue.' :
             isNetworkError ? 'Please check your internet connection and try again.' :
             error.message || 'An unexpected error occurred. Please try again.'}
          </p>
        </div>

        {/* Error Details (Development Only) */}
        {process.env.NODE_ENV === 'development' && (
          <details className="text-left">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
              Error Details
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40">
              {error.stack}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isAuthError ? (
            <Link href="/login">
              <Button>
                Go to Login
              </Button>
            </Link>
          ) : (
            <>
              <Button
                onClick={retry}
                variant="default"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              <Button
                onClick={() => router.back()}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </Button>
            </>
          )}
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Query-specific error boundary with React Query integration
 */
export function QueryErrorBoundary({
  children,
  ...props
}: ErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundaryComponent
          onReset={reset}
          fallback={(error, retry) => (
            <QueryErrorFallback error={error} retry={retry} reset={reset} />
          )}
          {...props}
        >
          {children}
        </ErrorBoundaryComponent>
      )}
    </QueryErrorResetBoundary>
  );
}

/**
 * Error fallback specific to React Query errors
 */
function QueryErrorFallback({
  error,
  retry,
  reset,
}: {
  error: Error;
  retry: () => void;
  reset: () => void;
}) {
  const queryClient = useQueryClient();

  const handleRetry = () => {
    // Reset React Query error boundary
    reset();
    // Retry the operation
    retry();
  };

  const handleRefreshAll = () => {
    // Invalidate all queries and retry
    queryClient.invalidateQueries();
    handleRetry();
  };

  return (
    <div className="flex min-h-[400px] items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-yellow-600" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">
            Failed to Load Data
          </h2>
          <p className="text-gray-600">
            {error.message || 'We encountered an error while fetching data.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={handleRetry}
            variant="default"
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
          <Button
            onClick={handleRefreshAll}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh All
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * HOC to wrap components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: ErrorBoundaryProps
) {
  const WrappedComponent = (props: P) => (
    <QueryErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </QueryErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

/**
 * Hook to programmatically trigger error boundary
 */
export function useErrorHandler() {
  return (error: Error) => {
    throw error;
  };
}
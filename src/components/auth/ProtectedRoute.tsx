'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthGuard } from '@/hooks/auth';
import type { UserRole, Permission } from '@/types/auth';
import { cn } from '@/lib/utils';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole | UserRole[];
  requiredPermission?: Permission | Permission[];
  fallback?: React.ComponentType;
  redirectTo?: string;
  redirectOnAuth?: string;
  className?: string;
}

// Loading component
function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// Unauthorized component
function UnauthorizedAccess() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-6 max-w-md mx-auto px-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-destructive">403</h1>
          <h2 className="text-2xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">
            You don&apos;t have permission to access this page.
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => router.back()}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Go Back
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProtectedRoute({
  children,
  requiredRole,
  requiredPermission,
  fallback: Fallback,
  redirectTo,
  redirectOnAuth,
  className,
}: ProtectedRouteProps) {
  const { isLoading, isAuthenticated, hasAccess } = useAuthGuard({
    requiredRole,
    requiredPermission,
    redirectTo,
    redirectOnAuth,
  });

  // Show loading state
  if (isLoading) {
    return Fallback ? <Fallback /> : <LoadingSpinner />;
  }

  // Show unauthorized if no access
  if (!hasAccess) {
    return Fallback ? <Fallback /> : <UnauthorizedAccess />;
  }

  // Render children if authenticated and authorized
  return (
    <div className={cn(className)}>
      {children}
    </div>
  );
}

// Higher-order component for page-level protection
export function withProtection<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: {
    requiredRole?: UserRole | UserRole[];
    requiredPermission?: Permission | Permission[];
    redirectTo?: string;
    redirectOnAuth?: string;
    fallback?: React.ComponentType;
  } = {}
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ProtectedComponent = (props: P) => {
    return (
      <ProtectedRoute {...options}>
        <WrappedComponent {...props} />
      </ProtectedRoute>
    );
  };

  ProtectedComponent.displayName = `withProtection(${displayName})`;

  return ProtectedComponent;
}

// Specific protection components for common use cases
export function RequireAuth({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRole={['user', 'vendor', 'admin']}>
      {children}
    </ProtectedRoute>
  );
}

export function RequireRole({
  children,
  role
}: {
  children: React.ReactNode;
  role: UserRole | UserRole[];
}) {
  return (
    <ProtectedRoute requiredRole={role}>
      {children}
    </ProtectedRoute>
  );
}

export function RequirePermission({
  children,
  permission
}: {
  children: React.ReactNode;
  permission: Permission | Permission[];
}) {
  return (
    <ProtectedRoute requiredPermission={permission}>
      {children}
    </ProtectedRoute>
  );
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRole="admin">
      {children}
    </ProtectedRoute>
  );
}

export function RequireVendor({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRole={['vendor', 'admin']}>
      {children}
    </ProtectedRoute>
  );
}

export function GuestOnly({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute redirectOnAuth="/dashboard">
      {children}
    </ProtectedRoute>
  );
}
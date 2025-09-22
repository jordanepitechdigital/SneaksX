import { useAuth } from './useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import type { UserRole, Permission } from '@/types/auth';
import { ROUTE_ACCESS } from '@/types/auth';

interface UseAuthGuardOptions {
  requiredRole?: UserRole | UserRole[];
  requiredPermission?: Permission | Permission[];
  redirectTo?: string;
  redirectOnAuth?: string;
  fallback?: React.ComponentType;
}

export function useAuthGuard(options: UseAuthGuardOptions = {}) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const {
    requiredRole,
    requiredPermission,
    redirectTo = '/login',
    redirectOnAuth,
  } = options;

  useEffect(() => {
    // Don't redirect if still loading
    if (auth.isLoading) return;

    // Check if user is authenticated
    const isAuthenticated = auth.isAuthenticated;

    // If user is authenticated but this route should redirect authenticated users
    if (isAuthenticated && redirectOnAuth) {
      router.push(redirectOnAuth);
      return;
    }

    // If authentication is required but user is not authenticated
    if ((requiredRole || requiredPermission) && !isAuthenticated) {
      const redirectUrl = `${redirectTo}?redirect=${encodeURIComponent(pathname)}`;
      router.push(redirectUrl);
      return;
    }

    // If user is authenticated, check role and permission requirements
    if (isAuthenticated) {
      // Check role requirement
      if (requiredRole) {
        const hasRequiredRole = Array.isArray(requiredRole)
          ? requiredRole.some(role => auth.hasRole(role))
          : auth.hasRole(requiredRole);

        if (!hasRequiredRole) {
          router.push('/unauthorized');
          return;
        }
      }

      // Check permission requirement
      if (requiredPermission) {
        const hasRequiredPermission = Array.isArray(requiredPermission)
          ? requiredPermission.some(permission => auth.hasPermission(permission))
          : auth.hasPermission(requiredPermission);

        if (!hasRequiredPermission) {
          router.push('/unauthorized');
          return;
        }
      }
    }
  }, [
    auth.isLoading,
    auth.isAuthenticated,
    auth.hasRole,
    auth.hasPermission,
    requiredRole,
    requiredPermission,
    redirectTo,
    redirectOnAuth,
    pathname,
    router,
  ]);

  return {
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
    user: auth.user,
    hasAccess: (() => {
      if (auth.isLoading) return false;
      if (!auth.isAuthenticated && (requiredRole || requiredPermission)) return false;

      if (requiredRole) {
        const hasRequiredRole = Array.isArray(requiredRole)
          ? requiredRole.some(role => auth.hasRole(role))
          : auth.hasRole(requiredRole);

        if (!hasRequiredRole) return false;
      }

      if (requiredPermission) {
        const hasRequiredPermission = Array.isArray(requiredPermission)
          ? requiredPermission.some(permission => auth.hasPermission(permission))
          : auth.hasPermission(requiredPermission);

        if (!hasRequiredPermission) return false;
      }

      return true;
    })(),
  };
}

export function useRouteAccess(pathname?: string) {
  const currentPath = usePathname();
  const pathToCheck = pathname || currentPath;
  const auth = useAuth();

  const routeConfig = ROUTE_ACCESS.find(route => {
    // Exact match
    if (route.path === pathToCheck) return true;

    // Dynamic route match (e.g., /products/[slug])
    if (route.path.includes('[')) {
      const routePattern = route.path.replace(/\[.*?\]/g, '[^/]+');
      const regex = new RegExp(`^${routePattern}$`);
      return regex.test(pathToCheck);
    }

    return false;
  });

  if (!routeConfig) {
    // If no specific config found, assume authentication required
    return {
      isPublic: false,
      hasAccess: auth.isAuthenticated,
      requiredRole: undefined,
      requiredPermission: undefined,
      redirectOnAuth: undefined,
      redirectOnUnauth: '/login',
    };
  }

  const hasAccess = (() => {
    // Public routes are always accessible
    if (routeConfig.isPublic) return true;

    // Check authentication
    if (!auth.isAuthenticated) return false;

    // Check role requirement
    if (routeConfig.requiredRole) {
      const hasRequiredRole = Array.isArray(routeConfig.requiredRole)
        ? routeConfig.requiredRole.some(role => auth.hasRole(role))
        : auth.hasRole(routeConfig.requiredRole);

      if (!hasRequiredRole) return false;
    }

    // Check permission requirement
    if (routeConfig.requiredPermission) {
      const hasRequiredPermission = Array.isArray(routeConfig.requiredPermission)
        ? routeConfig.requiredPermission.some(permission => auth.hasPermission(permission))
        : auth.hasPermission(routeConfig.requiredPermission);

      if (!hasRequiredPermission) return false;
    }

    return true;
  })();

  return {
    isPublic: routeConfig.isPublic || false,
    hasAccess,
    requiredRole: routeConfig.requiredRole,
    requiredPermission: routeConfig.requiredPermission,
    redirectOnAuth: routeConfig.redirectOnAuth,
    redirectOnUnauth: routeConfig.redirectOnUnauth || '/login',
  };
}
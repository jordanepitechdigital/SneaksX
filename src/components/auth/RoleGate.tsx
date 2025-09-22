'use client';

import { useAuth } from '@/hooks/auth';
import type { UserRole, Permission } from '@/types/auth';

interface RoleGateProps {
  children: React.ReactNode;
  allowedRoles?: UserRole | UserRole[];
  requiredPermissions?: Permission | Permission[];
  fallback?: React.ReactNode;
  requireAll?: boolean; // If true, user must have ALL permissions; if false, user needs ANY permission
}

export function RoleGate({
  children,
  allowedRoles,
  requiredPermissions,
  fallback = null,
  requireAll = false,
}: RoleGateProps) {
  const { user, hasRole, hasPermission } = useAuth();

  // If user is not authenticated, don't render
  if (!user) {
    return <>{fallback}</>;
  }

  // Check role requirements
  if (allowedRoles) {
    const roleArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const hasRequiredRole = roleArray.some(role => hasRole(role));

    if (!hasRequiredRole) {
      return <>{fallback}</>;
    }
  }

  // Check permission requirements
  if (requiredPermissions) {
    const permissionArray = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    const hasRequiredPermissions = requireAll
      ? permissionArray.every(permission => hasPermission(permission))
      : permissionArray.some(permission => hasPermission(permission));

    if (!hasRequiredPermissions) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}

// Specific role gates for convenience
export function AdminOnly({
  children,
  fallback = null
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGate allowedRoles="admin" fallback={fallback}>
      {children}
    </RoleGate>
  );
}

export function VendorOnly({
  children,
  fallback = null
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGate allowedRoles={['vendor', 'admin']} fallback={fallback}>
      {children}
    </RoleGate>
  );
}

export function UserOnly({
  children,
  fallback = null
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGate allowedRoles={['user', 'vendor', 'admin']} fallback={fallback}>
      {children}
    </RoleGate>
  );
}

export function PermissionGate({
  children,
  permission,
  fallback = null,
}: {
  children: React.ReactNode;
  permission: Permission | Permission[];
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGate requiredPermissions={permission} fallback={fallback}>
      {children}
    </RoleGate>
  );
}
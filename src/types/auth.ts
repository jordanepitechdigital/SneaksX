// Authentication and User Management Types
import type { User as SupabaseUser } from '@supabase/supabase-js';

export type UserRole = 'user' | 'vendor' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: UserRole;
  phone?: string;
  date_of_birth?: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  profile: UserProfile;
  supabaseUser: SupabaseUser;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    [key: string]: any;
  };
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (role: UserRole | UserRole[]) => boolean;
  hasPermission: (permission: string) => boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  role?: UserRole;
  phone?: string;
  agreeToTerms: boolean;
}

export interface UpdateProfileData {
  full_name?: string;
  phone?: string;
  date_of_birth?: string;
  avatar_url?: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ResetPasswordConfirm {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AuthError {
  message: string;
  code?: string;
  field?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
}

// Permission definitions
export const PERMISSIONS = {
  // User permissions
  USER_READ_OWN_PROFILE: 'user:read:own:profile',
  USER_UPDATE_OWN_PROFILE: 'user:update:own:profile',
  USER_DELETE_OWN_ACCOUNT: 'user:delete:own:account',
  USER_MANAGE_OWN_WATCHLIST: 'user:manage:own:watchlist',
  USER_PLACE_ORDERS: 'user:place:orders',
  USER_VIEW_OWN_ORDERS: 'user:view:own:orders',

  // Vendor permissions
  VENDOR_MANAGE_INVENTORY: 'vendor:manage:inventory',
  VENDOR_VIEW_SALES: 'vendor:view:sales',
  VENDOR_MANAGE_PRODUCTS: 'vendor:manage:products',
  VENDOR_VIEW_ANALYTICS: 'vendor:view:analytics',

  // Admin permissions
  ADMIN_MANAGE_USERS: 'admin:manage:users',
  ADMIN_MANAGE_PRODUCTS: 'admin:manage:products',
  ADMIN_MANAGE_ORDERS: 'admin:manage:orders',
  ADMIN_VIEW_ANALYTICS: 'admin:view:analytics',
  ADMIN_MANAGE_SYSTEM: 'admin:manage:system',
  ADMIN_MANAGE_ROLES: 'admin:manage:roles',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Role-based permission mapping
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  user: [
    PERMISSIONS.USER_READ_OWN_PROFILE,
    PERMISSIONS.USER_UPDATE_OWN_PROFILE,
    PERMISSIONS.USER_DELETE_OWN_ACCOUNT,
    PERMISSIONS.USER_MANAGE_OWN_WATCHLIST,
    PERMISSIONS.USER_PLACE_ORDERS,
    PERMISSIONS.USER_VIEW_OWN_ORDERS,
  ],
  vendor: [
    PERMISSIONS.USER_READ_OWN_PROFILE,
    PERMISSIONS.USER_UPDATE_OWN_PROFILE,
    PERMISSIONS.USER_DELETE_OWN_ACCOUNT,
    PERMISSIONS.USER_MANAGE_OWN_WATCHLIST,
    PERMISSIONS.USER_PLACE_ORDERS,
    PERMISSIONS.USER_VIEW_OWN_ORDERS,
    PERMISSIONS.VENDOR_MANAGE_INVENTORY,
    PERMISSIONS.VENDOR_VIEW_SALES,
    PERMISSIONS.VENDOR_MANAGE_PRODUCTS,
    PERMISSIONS.VENDOR_VIEW_ANALYTICS,
  ],
  admin: [
    PERMISSIONS.USER_READ_OWN_PROFILE,
    PERMISSIONS.USER_UPDATE_OWN_PROFILE,
    PERMISSIONS.USER_DELETE_OWN_ACCOUNT,
    PERMISSIONS.USER_MANAGE_OWN_WATCHLIST,
    PERMISSIONS.USER_PLACE_ORDERS,
    PERMISSIONS.USER_VIEW_OWN_ORDERS,
    PERMISSIONS.VENDOR_MANAGE_INVENTORY,
    PERMISSIONS.VENDOR_VIEW_SALES,
    PERMISSIONS.VENDOR_MANAGE_PRODUCTS,
    PERMISSIONS.VENDOR_VIEW_ANALYTICS,
    PERMISSIONS.ADMIN_MANAGE_USERS,
    PERMISSIONS.ADMIN_MANAGE_PRODUCTS,
    PERMISSIONS.ADMIN_MANAGE_ORDERS,
    PERMISSIONS.ADMIN_VIEW_ANALYTICS,
    PERMISSIONS.ADMIN_MANAGE_SYSTEM,
    PERMISSIONS.ADMIN_MANAGE_ROLES,
  ],
};

// Auth configuration
export interface AuthConfig {
  enableEmailVerification: boolean;
  enableSocialAuth: boolean;
  passwordMinLength: number;
  sessionTimeout: number;
  enableRememberMe: boolean;
  enablePasswordReset: boolean;
  enableAccountDeletion: boolean;
  defaultRole: UserRole;
}

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  enableEmailVerification: true,
  enableSocialAuth: true,
  passwordMinLength: 8,
  sessionTimeout: 3600000, // 1 hour in ms
  enableRememberMe: true,
  enablePasswordReset: true,
  enableAccountDeletion: true,
  defaultRole: 'user',
};

// Route access levels
export interface RouteAccess {
  path: string;
  requiredRole?: UserRole | UserRole[];
  requiredPermission?: Permission | Permission[];
  isPublic?: boolean;
  redirectOnAuth?: string;
  redirectOnUnauth?: string;
}

// Common route access configurations
export const ROUTE_ACCESS: RouteAccess[] = [
  // Public routes
  { path: '/', isPublic: true },
  { path: '/login', isPublic: true, redirectOnAuth: '/dashboard' },
  { path: '/register', isPublic: true, redirectOnAuth: '/dashboard' },
  { path: '/forgot-password', isPublic: true, redirectOnAuth: '/dashboard' },
  { path: '/reset-password', isPublic: true, redirectOnAuth: '/dashboard' },
  { path: '/products', isPublic: true },
  { path: '/products/[slug]', isPublic: true },
  { path: '/brands', isPublic: true },
  { path: '/brands/[slug]', isPublic: true },

  // User routes
  { path: '/dashboard', requiredRole: ['user', 'vendor', 'admin'] },
  { path: '/profile', requiredRole: ['user', 'vendor', 'admin'] },
  { path: '/watchlist', requiredRole: ['user', 'vendor', 'admin'] },
  { path: '/orders', requiredRole: ['user', 'vendor', 'admin'] },
  { path: '/cart', requiredRole: ['user', 'vendor', 'admin'] },
  { path: '/checkout', requiredRole: ['user', 'vendor', 'admin'] },

  // Vendor routes
  { path: '/vendor', requiredRole: ['vendor', 'admin'] },
  { path: '/vendor/inventory', requiredRole: ['vendor', 'admin'] },
  { path: '/vendor/sales', requiredRole: ['vendor', 'admin'] },
  { path: '/vendor/products', requiredRole: ['vendor', 'admin'] },
  { path: '/vendor/analytics', requiredRole: ['vendor', 'admin'] },

  // Admin routes
  { path: '/admin', requiredRole: 'admin' },
  { path: '/admin/users', requiredRole: 'admin' },
  { path: '/admin/products', requiredRole: 'admin' },
  { path: '/admin/orders', requiredRole: 'admin' },
  { path: '/admin/analytics', requiredRole: 'admin' },
  { path: '/admin/system', requiredRole: 'admin' },
];
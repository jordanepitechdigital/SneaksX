/**
 * Authentication React Query Hooks
 * Session management, user profiles, and auth state with React Query
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
  QueryClient,
} from '@tanstack/react-query';
import { authService } from '@/services/api/auth';
import type {
  AuthUser,
  UserProfile,
  LoginCredentials,
  RegisterCredentials,
  UpdateProfileData,
  ChangePasswordData,
  ResetPasswordRequest,
  ResetPasswordConfirm,
  AuthSession,
} from '@/types/auth';
import { STALE_TIME, CACHE_TIME, createQueryKeys } from '@/lib/react-query/config';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Query keys for authentication
export const authQueryKeys = {
  all: ['auth'] as const,
  session: () => ['auth', 'session'] as const,
  user: () => ['auth', 'user'] as const,
  profile: (userId: string) => ['auth', 'profile', userId] as const,
  permissions: () => ['auth', 'permissions'] as const,
  sessions: () => ['auth', 'sessions'] as const,
};

// ===== QUERY HOOKS =====

/**
 * Get current authenticated user
 */
export function useCurrentUser(
  options?: UseQueryOptions<AuthUser | null, Error>
) {
  return useQuery({
    queryKey: authQueryKeys.user(),
    queryFn: () => authService.getCurrentUser(),
    staleTime: STALE_TIME.MODERATE,
    gcTime: CACHE_TIME.EXTENDED,
    retry: false, // Don't retry auth failures
    ...options,
  });
}

/**
 * Get current session
 */
export function useSession(
  options?: UseQueryOptions<AuthSession | null, Error>
) {
  return useQuery({
    queryKey: authQueryKeys.session(),
    queryFn: async () => {
      const session = await authService.getSession();
      if (!session) return null;

      // Convert Session to AuthSession
      // This is a temporary adapter until authService returns proper AuthSession
      const authSession: AuthSession = {
        accessToken: session.access_token,
        refreshToken: session.refresh_token || '',
        expiresAt: session.expires_at || 0,
        user: {
          id: session.user.id,
          email: session.user.email || '',
          role: 'user' as any, // Will need proper role fetching
          profile: {
            id: session.user.id,
            email: session.user.email || '',
            full_name: session.user.user_metadata?.full_name || '',
            role: 'user' as any,
            is_active: true,
            email_verified: session.user.email_confirmed_at ? true : false,
            created_at: session.user.created_at || new Date().toISOString(),
            updated_at: session.user.updated_at || new Date().toISOString(),
          },
          supabaseUser: session.user,
        }
      };
      return authSession;
    },
    staleTime: STALE_TIME.FREQUENT,
    gcTime: CACHE_TIME.LONG,
    refetchInterval: 1000 * 60 * 5, // Check session every 5 minutes
    refetchOnWindowFocus: true, // Check when user returns
    retry: false,
    ...options,
  });
}

/**
 * Get user profile by ID
 */
export function useUserProfile(
  userId: string | undefined,
  options?: UseQueryOptions<UserProfile, Error>
) {
  return useQuery({
    queryKey: authQueryKeys.profile(userId!),
    queryFn: async () => {
      // For now, get current user profile if it matches
      const currentUser = await authService.getCurrentUser();
      if (currentUser && currentUser.id === userId) {
        return currentUser.profile;
      }
      // In the future, this should fetch from a profiles API endpoint
      throw new Error('getUserProfile not implemented for other users');
    },
    enabled: !!userId,
    staleTime: STALE_TIME.NORMAL,
    gcTime: CACHE_TIME.LONG,
    ...options,
  });
}

/**
 * Get all active sessions for the current user
 */
export function useActiveSessions(
  options?: UseQueryOptions<AuthSession[], Error>
) {
  return useQuery({
    queryKey: authQueryKeys.sessions(),
    queryFn: async () => {
      // This would need implementation in authService
      // For now, return current session as an array
      const session = await authService.getSession();
      if (!session) return [];

      // Convert to AuthSession format (same as above)
      const authSession: AuthSession = {
        accessToken: session.access_token,
        refreshToken: session.refresh_token || '',
        expiresAt: session.expires_at || 0,
        user: {
          id: session.user.id,
          email: session.user.email || '',
          role: 'user' as any,
          profile: {
            id: session.user.id,
            email: session.user.email || '',
            full_name: session.user.user_metadata?.full_name || '',
            role: 'user' as any,
            is_active: true,
            email_verified: session.user.email_confirmed_at ? true : false,
            created_at: session.user.created_at || new Date().toISOString(),
            updated_at: session.user.updated_at || new Date().toISOString(),
          },
          supabaseUser: session.user,
        }
      };
      return [authSession];
    },
    staleTime: STALE_TIME.FREQUENT,
    gcTime: CACHE_TIME.MEDIUM,
    ...options,
  });
}

/**
 * Check if user has specific permissions
 */
export function usePermissions(
  permissions?: string[],
  options?: UseQueryOptions<boolean, Error>
) {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: [...authQueryKeys.permissions(), permissions],
    queryFn: async () => {
      if (!user || !permissions) return false;
      return authService.hasPermission(permissions);
    },
    enabled: !!user && !!permissions?.length,
    staleTime: STALE_TIME.MODERATE,
    gcTime: CACHE_TIME.LONG,
    ...options,
  });
}

// ===== MUTATION HOOKS =====

/**
 * Login mutation
 */
export function useLogin(
  options?: UseMutationOptions<AuthUser, Error, LoginCredentials>
) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (credentials) => authService.login(credentials),
    onSuccess: (user) => {
      // Set user in cache
      queryClient.setQueryData(authQueryKeys.user(), user);

      // Invalidate session to fetch fresh
      queryClient.invalidateQueries({ queryKey: authQueryKeys.session() });

      // Clear any product/cart caches that might have user-specific data
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });

      toast.success('Welcome back!');

      // Redirect to dashboard or previous page
      const redirectUrl = sessionStorage.getItem('redirectAfterLogin') || '/';
      sessionStorage.removeItem('redirectAfterLogin');
      router.push(redirectUrl);
    },
    onError: (error) => {
      toast.error(error.message || 'Login failed');
    },
    ...options,
  });
}

/**
 * Register mutation
 */
export function useRegister(
  options?: UseMutationOptions<AuthUser, Error, RegisterCredentials>
) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (credentials) => authService.register(credentials),
    onSuccess: (user) => {
      // Set user in cache
      queryClient.setQueryData(authQueryKeys.user(), user);

      // Invalidate session
      queryClient.invalidateQueries({ queryKey: authQueryKeys.session() });

      toast.success('Account created successfully!');

      // Redirect to onboarding or home
      router.push('/onboarding');
    },
    onError: (error) => {
      toast.error(error.message || 'Registration failed');
    },
    ...options,
  });
}

/**
 * Logout mutation
 */
export function useLogout(
  options?: UseMutationOptions<void, Error, void>
) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      // Clear all auth-related caches
      queryClient.removeQueries({ queryKey: authQueryKeys.all });

      // Clear user-specific data
      queryClient.removeQueries({ queryKey: ['cart'] });
      queryClient.removeQueries({ queryKey: ['orders'] });
      queryClient.removeQueries({ queryKey: ['wishlist'] });

      // Invalidate products to refresh any user-specific pricing
      queryClient.invalidateQueries({ queryKey: ['products'] });

      toast.success('Logged out successfully');
      router.push('/');
    },
    onError: (error) => {
      toast.error(error.message || 'Logout failed');
    },
    ...options,
  });
}

/**
 * Update profile mutation
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation<UserProfile, Error, UpdateProfileData, { previousUser: AuthUser | undefined }>({
    mutationFn: (data) => authService.updateProfile(data),
    onMutate: async (data) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: authQueryKeys.user() });

      // Snapshot previous value
      const previousUser = queryClient.getQueryData<AuthUser>(authQueryKeys.user());

      // Optimistically update
      if (previousUser) {
        queryClient.setQueryData<AuthUser>(authQueryKeys.user(), {
          ...previousUser,
          ...data,
        });
      }

      // Return context
      return { previousUser };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousUser) {
        queryClient.setQueryData(authQueryKeys.user(), context.previousUser);
      }
      toast.error('Failed to update profile');
    },
    onSuccess: (profile) => {
      // Update cache with server response
      queryClient.setQueryData(authQueryKeys.profile(profile.id), profile);
      queryClient.invalidateQueries({ queryKey: authQueryKeys.user() });

      toast.success('Profile updated successfully');
    },
  });
}

/**
 * Change password mutation
 */
export function useChangePassword(
  options?: UseMutationOptions<void, Error, ChangePasswordData>
) {
  return useMutation({
    mutationFn: (data) => authService.changePassword(data),
    onSuccess: () => {
      toast.success('Password changed successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to change password');
    },
    ...options,
  });
}

/**
 * Request password reset mutation
 */
export function useRequestPasswordReset(
  options?: UseMutationOptions<void, Error, ResetPasswordRequest>
) {
  return useMutation({
    mutationFn: (data) => authService.resetPasswordRequest(data),
    onSuccess: () => {
      toast.success('Password reset email sent. Check your inbox.');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to send reset email');
    },
    ...options,
  });
}

/**
 * Confirm password reset mutation
 */
export function useConfirmPasswordReset(
  options?: UseMutationOptions<void, Error, ResetPasswordConfirm>
) {
  const router = useRouter();

  return useMutation({
    mutationFn: (data) => authService.resetPasswordConfirm(data),
    onSuccess: () => {
      toast.success('Password reset successfully. You can now login.');
      router.push('/login');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to reset password');
    },
    ...options,
  });
}

/**
 * Revoke session mutation
 * TODO: Implement revokeSession method in AuthService when needed
 */
// export function useRevokeSession(
//   options?: UseMutationOptions<void, Error, string>
// ) {
//   const queryClient = useQueryClient();

//   return useMutation({
//     mutationFn: (sessionId) => authService.revokeSession(sessionId),
//     onSuccess: () => {
//       // Refresh active sessions
//       queryClient.invalidateQueries({ queryKey: authQueryKeys.sessions() });
//       toast.success('Session revoked successfully');
//     },
//     onError: (error) => {
//       toast.error(error.message || 'Failed to revoke session');
//     },
//     ...options,
//   });
// }

/**
 * Delete account mutation
 */
export function useDeleteAccount(
  options?: UseMutationOptions<void, Error, void>
) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => authService.deleteAccount(),
    onSuccess: () => {
      // Clear all caches
      queryClient.clear();

      toast.success('Account deleted successfully');
      router.push('/');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete account');
    },
    ...options,
  });
}

// ===== UTILITY HOOKS =====

/**
 * Check if user is authenticated
 */
export function useIsAuthenticated() {
  const { data: user, isLoading } = useCurrentUser();
  return {
    isAuthenticated: !!user,
    isLoading,
    user,
  };
}

/**
 * Check if user has a specific role
 */
export function useHasRole(role: string) {
  const { data: user } = useCurrentUser();
  return user?.role === role;
}

/**
 * Auth guard hook for protected routes
 */
export function useAuthGuard(
  requiredRole?: string,
  redirectTo: string = '/login'
) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useIsAuthenticated();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        // Store current URL for redirect after login
        sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
        router.push(redirectTo);
      } else if (requiredRole && user?.role !== requiredRole) {
        toast.error('You do not have permission to access this page');
        router.push('/');
      }
    }
  }, [isAuthenticated, isLoading, user, requiredRole, redirectTo, router]);

  return { isAuthenticated, isLoading, user };
}

// ===== PREFETCH UTILITIES =====

/**
 * Prefetch user session on app load
 */
export async function prefetchAuthData(queryClient: QueryClient) {
  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: authQueryKeys.user(),
        queryFn: () => authService.getCurrentUser(),
        staleTime: STALE_TIME.MODERATE,
      }),
      queryClient.prefetchQuery({
        queryKey: authQueryKeys.session(),
        queryFn: () => authService.getSession(),
        staleTime: STALE_TIME.FREQUENT,
      }),
    ]);
  } catch (error) {
    // Silent fail - user not authenticated
  }
}

/**
 * Clear all auth-related caches
 */
export function clearAuthCache(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: authQueryKeys.all });
}
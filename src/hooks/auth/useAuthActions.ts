import { useAuth } from './useAuth';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { LoginCredentials, RegisterCredentials } from '@/types/auth';

export function useAuthActions() {
  const auth = useAuth();
  const router = useRouter();

  const login = useCallback(async (credentials: LoginCredentials) => {
    const result = await auth.signIn(credentials);

    if (result.user) {
      // Redirect based on user role
      const redirectPath = getRedirectPath(result.user.role);
      router.push(redirectPath);
    }

    return result;
  }, [auth, router]);

  const register = useCallback(async (credentials: RegisterCredentials) => {
    const result = await auth.signUp(credentials);

    if (result.user) {
      // Redirect to email verification notice or dashboard
      router.push('/auth/verify-email');
    }

    return result;
  }, [auth, router]);

  const logout = useCallback(async () => {
    const result = await auth.signOut();

    if (!result.error) {
      router.push('/');
    }

    return result;
  }, [auth, router]);

  const forgotPassword = useCallback(async (email: string) => {
    return await auth.resetPassword(email);
  }, [auth]);

  return {
    login,
    register,
    logout,
    forgotPassword,
    updatePassword: auth.updatePassword,
    updateProfile: auth.updateProfile,
    refreshSession: auth.refreshSession,
  };
}

function getRedirectPath(role: 'user' | 'vendor' | 'admin'): string {
  switch (role) {
    case 'admin':
      return '/admin/dashboard';
    case 'vendor':
      return '/vendor/dashboard';
    case 'user':
    default:
      return '/dashboard';
  }
}
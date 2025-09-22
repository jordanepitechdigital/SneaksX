'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { type User as SupabaseUser, type Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient, authDbService } from './client';
import type {
  AuthUser,
  AuthState,
  UserRole,
  UserProfile,
  Permission,
  LoginCredentials,
  RegisterCredentials,
  AuthError,
} from '@/types/auth';
import { ROLE_PERMISSIONS } from '@/types/auth';
import { toast } from 'react-hot-toast';

interface AuthContextType extends AuthState {
  // Authentication methods
  signIn: (credentials: LoginCredentials) => Promise<{ user?: AuthUser; error?: AuthError }>;
  signUp: (credentials: RegisterCredentials) => Promise<{ user?: AuthUser; error?: AuthError }>;
  signOut: () => Promise<{ error?: AuthError }>;

  // Password management
  resetPassword: (email: string) => Promise<{ error?: AuthError }>;
  updatePassword: (newPassword: string) => Promise<{ error?: AuthError }>;

  // Profile management
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ user?: AuthUser; error?: AuthError }>;

  // Session management
  refreshSession: () => Promise<void>;

  // Utility methods
  checkPermission: (permission: Permission) => boolean;
  requireAuth: () => boolean;
  requireRole: (role: UserRole | UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
  onAuthStateChange?: (user: AuthUser | null) => void;
}

export function AuthProvider({ children, onAuthStateChange }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supabase] = useState(() => createSupabaseBrowserClient());

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          await loadUserProfile(session.user);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.id);

      if (session?.user) {
        await loadUserProfile(session.user);
      } else {
        setUser(null);
        onAuthStateChange?.(null);
      }

      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, onAuthStateChange]);

  // Load user profile from database
  const loadUserProfile = async (supabaseUser: SupabaseUser) => {
    try {
      const profile = await authDbService.getUserProfile(supabaseUser.id);

      const authUser: AuthUser = {
        id: supabaseUser.id,
        email: supabaseUser.email!,
        role: profile.role,
        profile,
        supabaseUser,
      };

      setUser(authUser);
      onAuthStateChange?.(authUser);

      // Log successful session load
      await authDbService.logAuditEvent({
        event_type: 'auth',
        entity_type: 'session',
        user_id: supabaseUser.id,
        action: 'session_loaded',
        severity: 'info',
        source: 'auth_provider',
        metadata: {
          email: supabaseUser.email,
          role: profile.role,
        },
      });
    } catch (error) {
      console.error('Error loading user profile:', error);
      // If profile doesn't exist, sign out the user
      await supabase.auth.signOut();
      setUser(null);
      onAuthStateChange?.(null);
    }
  };

  // Sign in method
  const signIn = useCallback(async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email.toLowerCase().trim(),
        password: credentials.password,
      });

      if (error) {
        const authError: AuthError = {
          message: error.message,
          code: error.message,
        };

        // Log failed sign in
        await authDbService.logAuditEvent({
          event_type: 'auth',
          entity_type: 'session',
          action: 'sign_in_failed',
          severity: 'warning',
          source: 'auth_provider',
          metadata: {
            email: credentials.email,
            error: error.message,
          },
        });

        return { error: authError };
      }

      if (data.user) {
        // Profile will be loaded automatically by the auth state change listener
        toast.success('Welcome back!');

        return { user: user! }; // User will be set by the auth state change
      }

      return { error: { message: 'Unknown error occurred' } };
    } catch (error) {
      console.error('Sign in error:', error);
      return {
        error: {
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      };
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user]);

  // Sign up method
  const signUp = useCallback(async (credentials: RegisterCredentials) => {
    try {
      setIsLoading(true);

      // Validate passwords match
      if (credentials.password !== credentials.confirmPassword) {
        return {
          error: {
            message: 'Passwords do not match',
            field: 'confirmPassword',
          },
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email: credentials.email.toLowerCase().trim(),
        password: credentials.password,
        options: {
          data: {
            full_name: credentials.fullName,
            role: credentials.role || 'user',
            phone: credentials.phone,
          },
        },
      });

      if (error) {
        const authError: AuthError = {
          message: error.message,
          code: error.message,
        };

        await authDbService.logAuditEvent({
          event_type: 'auth',
          entity_type: 'user',
          action: 'sign_up_failed',
          severity: 'warning',
          source: 'auth_provider',
          metadata: {
            email: credentials.email,
            error: error.message,
          },
        });

        return { error: authError };
      }

      if (data.user) {
        // Create user profile in our database
        try {
          await authDbService.createUserProfile({
            id: data.user.id,
            email: data.user.email!,
            full_name: credentials.fullName,
            role: credentials.role || 'user',
            phone: credentials.phone,
          });

          toast.success('Account created! Please check your email to verify your account.');

          await authDbService.logAuditEvent({
            event_type: 'auth',
            entity_type: 'user',
            user_id: data.user.id,
            action: 'account_created',
            severity: 'info',
            source: 'auth_provider',
            metadata: {
              email: data.user.email,
              role: credentials.role || 'user',
            },
          });

          return { user: user! }; // User will be set by auth state change
        } catch (profileError) {
          console.error('Error creating user profile:', profileError);
          // Clean up the auth user if profile creation fails
          await supabase.auth.signOut();
          return {
            error: {
              message: 'Failed to create user profile. Please try again.',
            },
          };
        }
      }

      return { error: { message: 'Unknown error occurred' } };
    } catch (error) {
      console.error('Sign up error:', error);
      return {
        error: {
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      };
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user]);

  // Sign out method
  const signOut = useCallback(async () => {
    try {
      const currentUserId = user?.id;

      const { error } = await supabase.auth.signOut();

      if (error) {
        return { error: { message: error.message } };
      }

      // Log successful sign out
      if (currentUserId) {
        await authDbService.logAuditEvent({
          event_type: 'auth',
          entity_type: 'session',
          user_id: currentUserId,
          action: 'sign_out',
          severity: 'info',
          source: 'auth_provider',
        });
      }

      toast.success('Signed out successfully');
      return {};
    } catch (error) {
      console.error('Sign out error:', error);
      return {
        error: {
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      };
    }
  }, [supabase, user]);

  // Reset password method
  const resetPassword = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        return { error: { message: error.message } };
      }

      toast.success('Password reset email sent! Check your inbox.');
      return {};
    } catch (error) {
      console.error('Reset password error:', error);
      return {
        error: {
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      };
    }
  }, [supabase]);

  // Update password method
  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { error: { message: error.message } };
      }

      if (user) {
        await authDbService.logAuditEvent({
          event_type: 'auth',
          entity_type: 'user',
          user_id: user.id,
          action: 'password_updated',
          severity: 'info',
          source: 'auth_provider',
        });
      }

      toast.success('Password updated successfully');
      return {};
    } catch (error) {
      console.error('Update password error:', error);
      return {
        error: {
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      };
    }
  }, [supabase, user]);

  // Update profile method
  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!user) {
      return { error: { message: 'User not authenticated' } };
    }

    try {
      const updatedProfile = await authDbService.updateUserProfile(user.id, updates);

      const updatedUser: AuthUser = {
        ...user,
        profile: updatedProfile,
      };

      setUser(updatedUser);
      onAuthStateChange?.(updatedUser);

      await authDbService.logAuditEvent({
        event_type: 'profile',
        entity_type: 'user',
        user_id: user.id,
        action: 'profile_updated',
        severity: 'info',
        source: 'auth_provider',
        old_values: user.profile,
        new_values: updatedProfile,
      });

      toast.success('Profile updated successfully');
      return { user: updatedUser };
    } catch (error) {
      console.error('Update profile error:', error);
      return {
        error: {
          message: error instanceof Error ? error.message : 'Failed to update profile',
        },
      };
    }
  }, [user, onAuthStateChange]);

  // Refresh session method
  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('Error refreshing session:', error);
      }
    } catch (error) {
      console.error('Refresh session error:', error);
    }
  }, [supabase]);

  // Utility methods
  const hasRole = useCallback((requiredRole: UserRole | UserRole[]) => {
    if (!user) return false;

    if (Array.isArray(requiredRole)) {
      return requiredRole.includes(user.role);
    }

    return user.role === requiredRole;
  }, [user]);

  const hasPermission = useCallback((permission: Permission) => {
    if (!user) return false;

    const userPermissions = ROLE_PERMISSIONS[user.role] || [];
    return userPermissions.includes(permission);
  }, [user]);

  const checkPermission = useCallback((permission: Permission) => {
    return hasPermission(permission);
  }, [hasPermission]);

  const requireAuth = useCallback(() => {
    return !!user;
  }, [user]);

  const requireRole = useCallback((role: UserRole | UserRole[]) => {
    return hasRole(role);
  }, [hasRole]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    hasRole,
    hasPermission,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    refreshSession,
    checkPermission,
    requireAuth,
    requireRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
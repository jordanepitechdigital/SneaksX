'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authService } from '@/services/api/auth'
import { routeGuard } from '@/services/api/middleware'
import type {
  AuthUser,
  AuthState,
  LoginCredentials,
  RegisterCredentials,
  UpdateProfileData,
  UserRole,
  Permission
} from '@/types/auth'

interface AuthContextType extends AuthState {
  // Authentication methods
  login: (credentials: LoginCredentials) => Promise<void>
  register: (credentials: RegisterCredentials) => Promise<void>
  logout: () => Promise<void>

  // Profile management
  updateProfile: (data: UpdateProfileData) => Promise<void>

  // Password management
  resetPassword: (email: string) => Promise<void>

  // OAuth
  loginWithGoogle: () => Promise<void>
  loginWithGithub: () => Promise<void>

  // Session
  refreshSession: () => Promise<void>

  // Email verification
  resendVerificationEmail: () => Promise<void>

  // Error state
  error: string | null
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize auth service on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setLoading(true)

        // Configure auth service with state change handler
        const service = authService;

        // Get initial user
        const currentUser = await service.getCurrentUser()
        setUser(currentUser)

      } catch (error) {
        console.error('Error initializing auth:', error)
        setError('Failed to initialize authentication')
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()

    // Cleanup on unmount
    return () => {
      // Auth service handles its own cleanup
    }
  }, [])

  // Clear error after timeout
  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timeout)
    }
  }, [error])

  // Authentication methods
  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      setError(null)
      setLoading(true)
      const authUser = await authService.login(credentials)
      setUser(authUser)
    } catch (error: any) {
      setError(error.message || 'Login failed')
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const register = useCallback(async (credentials: RegisterCredentials) => {
    try {
      setError(null)
      setLoading(true)
      const authUser = await authService.register(credentials)
      setUser(authUser)
    } catch (error: any) {
      setError(error.message || 'Registration failed')
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      await authService.logout()
      setUser(null)
    } catch (error: any) {
      setError(error.message || 'Logout failed')
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  // Profile management
  const updateProfile = useCallback(async (data: UpdateProfileData) => {
    try {
      setError(null)
      const profile = await authService.updateProfile(data)
      if (user) {
        setUser({ ...user, profile })
      }
    } catch (error: any) {
      setError(error.message || 'Profile update failed')
      throw error
    }
  }, [user])

  // Password management
  const resetPassword = useCallback(async (email: string) => {
    try {
      setError(null)
      await authService.resetPasswordRequest({ email })
    } catch (error: any) {
      setError(error.message || 'Password reset failed')
      throw error
    }
  }, [])

  // OAuth
  const loginWithGoogle = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      await authService.loginWithProvider('google')
    } catch (error: any) {
      setError(error.message || 'Google login failed')
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const loginWithGithub = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      await authService.loginWithProvider('github')
    } catch (error: any) {
      setError(error.message || 'GitHub login failed')
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  // Session management
  const refreshSession = useCallback(async () => {
    try {
      setError(null)
      await authService.refreshSession()
    } catch (error: any) {
      setError(error.message || 'Session refresh failed')
      throw error
    }
  }, [])

  // Email verification
  const resendVerificationEmail = useCallback(async () => {
    try {
      setError(null)
      await authService.resendVerificationEmail()
    } catch (error: any) {
      setError(error.message || 'Failed to resend verification email')
      throw error
    }
  }, [])

  // Helper methods
  const hasRole = useCallback((role: UserRole | UserRole[]) => {
    return authService.hasRole(role)
  }, [])

  const hasPermission = useCallback((permission: string) => {
    return authService.hasPermission(permission)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Context value
  const value: AuthContextType = {
    user,
    isLoading: loading,
    isAuthenticated: !!user,
    hasRole,
    hasPermission,
    login,
    register,
    logout,
    updateProfile,
    resetPassword,
    loginWithGoogle,
    loginWithGithub,
    refreshSession,
    resendVerificationEmail,
    error,
    clearError,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Export route protection hook
export const useRouteGuard = (
  requiredRole?: UserRole | UserRole[],
  requiredPermission?: Permission | Permission[]
) => {
  const { user, isLoading } = useAuth()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      routeGuard({
        requiredRole,
        requiredPermission,
      }).then(setIsAuthorized)
    }
  }, [user, isLoading, requiredRole, requiredPermission])

  return { isAuthorized, isLoading }
}
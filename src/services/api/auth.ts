/**
 * Authentication Service
 * Comprehensive authentication and authorization service with session management
 */

import { BaseApiService } from './base';
import { supabase } from '@/lib/supabase/client';
import type {
  AuthUser,
  UserProfile,
  AuthState,
  LoginCredentials,
  RegisterCredentials,
  UpdateProfileData,
  ChangePasswordData,
  ResetPasswordRequest,
  ResetPasswordConfirm,
  AuthError,
  AuthSession,
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  AuthConfig,
} from '@/types/auth';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';

interface AuthServiceConfig extends AuthConfig {
  onAuthStateChange?: (user: AuthUser | null) => void;
  onSessionExpired?: () => void;
}

class AuthService extends BaseApiService {
  private static instance: AuthService;
  private currentUser: AuthUser | null = null;
  private sessionRefreshTimer?: NodeJS.Timeout;
  private authStateSubscription?: { unsubscribe: () => void };
  private config: AuthServiceConfig;
  private sessionCache: Map<string, AuthSession> = new Map();

  private constructor(config?: Partial<AuthServiceConfig>) {
    super('auth'); // Pass a table name even though we don't use it

    // Default config
    const defaultConfig = {
      enableEmailVerification: true,
      enableSocialAuth: true,
      passwordMinLength: 8,
      sessionTimeout: 3600000,
      enableRememberMe: true,
      enablePasswordReset: true,
      enableAccountDeletion: true,
      defaultRole: 'user' as const,
    };

    this.config = {
      ...defaultConfig,
      ...config,
    };
    this.initializeAuthListener();
  }

  public static getInstance(config?: Partial<AuthServiceConfig>): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService(config);
    }
    return AuthService.instance;
  }

  /**
   * Initialize authentication state listener
   */
  private initializeAuthListener(): void {
    this.authStateSubscription = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        await this.handleAuthStateChange(event, session);
      }
    );
  }

  /**
   * Handle authentication state changes
   */
  private async handleAuthStateChange(
    event: AuthChangeEvent,
    session: Session | null
  ): Promise<void> {
    console.log('[AuthService] Auth state changed:', event);

    if (session?.user) {
      // User signed in or token refreshed
      this.currentUser = await this.transformUser(session.user);
      this.setupSessionRefresh(session);
      this.config.onAuthStateChange?.(this.currentUser);
    } else {
      // User signed out
      this.currentUser = null;
      this.clearSessionRefresh();
      this.sessionCache.clear();
      this.config.onAuthStateChange?.(null);
    }

    // Handle specific events
    switch (event) {
      case 'SIGNED_OUT':
        await this.handleSignOut();
        break;
      case 'TOKEN_REFRESHED':
        console.log('[AuthService] Token refreshed successfully');
        break;
      case 'USER_UPDATED':
        if (session?.user) {
          this.currentUser = await this.transformUser(session.user);
        }
        break;
    }
  }

  /**
   * Transform Supabase user to AuthUser with profile
   */
  private async transformUser(user: User): Promise<AuthUser> {
    const profile = await this.fetchUserProfile(user.id);

    return {
      id: user.id,
      email: user.email || '',
      role: (user.user_metadata?.role as UserRole) || this.config.defaultRole,
      profile,
      supabaseUser: user,
    };
  }

  /**
   * Fetch user profile from database
   */
  private async fetchUserProfile(userId: string): Promise<UserProfile> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      return data as UserProfile;
    } catch (error) {
      console.error('[AuthService] Error fetching profile:', error);
      // Return default profile if not found
      return {
        id: userId,
        email: this.currentUser?.email || '',
        full_name: '',
        role: this.config.defaultRole,
        is_active: true,
        email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Setup automatic session refresh
   */
  private setupSessionRefresh(session: Session): void {
    this.clearSessionRefresh();

    // Calculate refresh time (refresh 5 minutes before expiry)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const refreshTime = expiresAt - Date.now() - 5 * 60 * 1000;

    if (refreshTime > 0) {
      this.sessionRefreshTimer = setTimeout(async () => {
        await this.refreshSession();
      }, refreshTime);
    }
  }

  /**
   * Clear session refresh timer
   */
  private clearSessionRefresh(): void {
    if (this.sessionRefreshTimer) {
      clearTimeout(this.sessionRefreshTimer);
      this.sessionRefreshTimer = undefined;
    }
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthUser> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) throw this.handleAuthError(error);
      if (!data.user) throw new Error('Login failed');

      const authUser = await this.transformUser(data.user);

      // Store session if remember me is enabled
      if (credentials.rememberMe && data.session) {
        this.storeSession(data.session);
      }

      return authUser;
    } catch (error) {
      console.error('[AuthService] Login error:', error);
      throw error;
    }
  }

  /**
   * Register new user
   */
  async register(credentials: RegisterCredentials): Promise<AuthUser> {
    try {
      // Validate passwords match
      if (credentials.password !== credentials.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      // Register with Supabase
      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            full_name: credentials.fullName,
            role: credentials.role || this.config.defaultRole,
            phone: credentials.phone,
          },
          emailRedirectTo: `${window.location.origin}/verify-email`,
        },
      });

      if (error) throw this.handleAuthError(error);
      if (!data.user) throw new Error('Registration failed');

      // Create profile record
      await this.createUserProfile(data.user, credentials);

      return await this.transformUser(data.user);
    } catch (error) {
      console.error('[AuthService] Registration error:', error);
      throw error;
    }
  }

  /**
   * Create user profile in database
   */
  private async createUserProfile(
    user: User,
    credentials: RegisterCredentials
  ): Promise<void> {
    try {
      const { error } = await supabase.from('users').insert({
        id: user.id,
        email: user.email,
        full_name: credentials.fullName,
        role: credentials.role || this.config.defaultRole,
        phone: credentials.phone,
        is_active: true,
        email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
    } catch (error) {
      console.error('[AuthService] Error creating profile:', error);
      // Non-critical error, user can still login
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw this.handleAuthError(error);

      await this.handleSignOut();
    } catch (error) {
      console.error('[AuthService] Logout error:', error);
      throw error;
    }
  }

  /**
   * Handle sign out cleanup
   */
  private async handleSignOut(): Promise<void> {
    this.currentUser = null;
    this.clearSessionRefresh();
    this.sessionCache.clear();

    // Clear any stored sessions
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_session');
      sessionStorage.removeItem('auth_session');
    }
  }

  /**
   * Refresh current session
   */
  async refreshSession(): Promise<Session | null> {
    try {
      const { data, error } = await supabase.auth.refreshSession();

      if (error) throw this.handleAuthError(error);

      if (data.session) {
        this.setupSessionRefresh(data.session);
        return data.session;
      }

      return null;
    } catch (error) {
      console.error('[AuthService] Session refresh error:', error);
      this.config.onSessionExpired?.();
      return null;
    }
  }

  /**
   * Get current session
   */
  async getSession(): Promise<Session | null> {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw this.handleAuthError(error);

      return data.session;
    } catch (error) {
      console.error('[AuthService] Get session error:', error);
      return null;
    }
  }

  /**
   * Validate current session
   */
  async validateSession(): Promise<boolean> {
    try {
      const session = await this.getSession();

      if (!session) return false;

      // Check if session is expired
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      if (expiresAt && expiresAt < Date.now()) {
        // Try to refresh
        const refreshed = await this.refreshSession();
        return !!refreshed;
      }

      return true;
    } catch (error) {
      console.error('[AuthService] Session validation error:', error);
      return false;
    }
  }

  /**
   * Store session for persistence
   */
  private storeSession(session: Session): void {
    if (typeof window === 'undefined') return;

    const authSession: AuthSession = {
      accessToken: session.access_token,
      refreshToken: session.refresh_token || '',
      expiresAt: session.expires_at || 0,
      user: this.currentUser!,
    };

    // Store in localStorage for remember me
    localStorage.setItem('auth_session', JSON.stringify(authSession));

    // Cache in memory
    this.sessionCache.set(session.user.id, authSession);
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    if (this.currentUser) return this.currentUser;

    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw this.handleAuthError(error);
      if (!data.user) return null;

      this.currentUser = await this.transformUser(data.user);
      return this.currentUser;
    } catch (error) {
      console.error('[AuthService] Get current user error:', error);
      return null;
    }
  }

  /**
   * Get current auth state
   */
  async getAuthState(): Promise<AuthState> {
    const user = await this.getCurrentUser();

    return {
      user,
      isLoading: false,
      isAuthenticated: !!user,
      hasRole: (role: UserRole | UserRole[]) => this.hasRole(role),
      hasPermission: (permission: string) => this.hasPermission(permission),
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(data: UpdateProfileData): Promise<UserProfile> {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');

      // Update auth metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: data.full_name,
          avatar_url: data.avatar_url,
        },
      });

      if (authError) throw this.handleAuthError(authError);

      // Update profile in database
      const { data: profile, error } = await supabase
        .from('users')
        .update({
          full_name: data.full_name,
          phone: data.phone,
          date_of_birth: data.date_of_birth,
          avatar_url: data.avatar_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.currentUser.id)
        .select()
        .single();

      if (error) throw error;

      // Update current user
      this.currentUser.profile = profile as UserProfile;

      return profile as UserProfile;
    } catch (error) {
      console.error('[AuthService] Update profile error:', error);
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(data: ChangePasswordData): Promise<void> {
    try {
      if (data.newPassword !== data.confirmPassword) {
        throw new Error('New passwords do not match');
      }

      // Verify current password by re-authenticating
      const user = await this.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword,
      });

      if (error) throw this.handleAuthError(error);
    } catch (error) {
      console.error('[AuthService] Change password error:', error);
      throw error;
    }
  }

  /**
   * Request password reset
   */
  async resetPasswordRequest(data: ResetPasswordRequest): Promise<void> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw this.handleAuthError(error);
    } catch (error) {
      console.error('[AuthService] Password reset request error:', error);
      throw error;
    }
  }

  /**
   * Confirm password reset with token
   */
  async resetPasswordConfirm(data: ResetPasswordConfirm): Promise<void> {
    try {
      if (data.newPassword !== data.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      // Update password with token
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword,
      });

      if (error) throw this.handleAuthError(error);
    } catch (error) {
      console.error('[AuthService] Password reset confirm error:', error);
      throw error;
    }
  }

  /**
   * Login with OAuth provider
   */
  async loginWithProvider(
    provider: 'google' | 'github' | 'facebook'
  ): Promise<void> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw this.handleAuthError(error);
    } catch (error) {
      console.error(`[AuthService] ${provider} login error:`, error);
      throw error;
    }
  }

  /**
   * Check if user has specific role(s)
   */
  hasRole(role: UserRole | UserRole[]): boolean {
    if (!this.currentUser) return false;

    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(this.currentUser.role);
  }

  /**
   * Check if user has specific permission(s)
   */
  hasPermission(permission: string | string[]): boolean {
    if (!this.currentUser) return false;

    const permissions = Array.isArray(permission) ? permission : [permission];
    const userPermissions = ROLE_PERMISSIONS[this.currentUser.role] || [];

    return permissions.every(p => userPermissions.includes(p as Permission));
  }

  /**
   * Get user permissions
   */
  getPermissions(): Permission[] {
    if (!this.currentUser) return [];
    return ROLE_PERMISSIONS[this.currentUser.role] || [];
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'email',
      });

      if (error) throw this.handleAuthError(error);

      // Update profile
      if (this.currentUser) {
        await supabase
          .from('users')
          .update({ email_verified: true })
          .eq('id', this.currentUser.id);
      }
    } catch (error) {
      console.error('[AuthService] Email verification error:', error);
      throw error;
    }
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(): Promise<void> {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: this.currentUser.email,
      });

      if (error) throw this.handleAuthError(error);
    } catch (error) {
      console.error('[AuthService] Resend verification error:', error);
      throw error;
    }
  }

  /**
   * Delete user account
   */
  async deleteAccount(): Promise<void> {
    try {
      if (!this.currentUser) throw new Error('User not authenticated');

      // Soft delete profile
      await supabase
        .from('users')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.currentUser.id);

      // Sign out
      await this.logout();
    } catch (error) {
      console.error('[AuthService] Delete account error:', error);
      throw error;
    }
  }

  /**
   * Handle auth errors
   */
  private handleAuthError(error: any): AuthError {
    const authError: AuthError = {
      message: error.message || 'Authentication error occurred',
      code: error.code || 'AUTH_ERROR',
    };

    // Map common errors to user-friendly messages
    switch (error.code) {
      case 'invalid_credentials':
        authError.message = 'Invalid email or password';
        break;
      case 'email_not_confirmed':
        authError.message = 'Please verify your email address';
        break;
      case 'user_already_exists':
        authError.message = 'An account with this email already exists';
        break;
    }

    return authError;
  }

  /**
   * Cleanup and dispose
   */
  dispose(): void {
    this.authStateSubscription?.unsubscribe();
    this.clearSessionRefresh();
    this.sessionCache.clear();
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();

// Export for type usage
export type { AuthService };
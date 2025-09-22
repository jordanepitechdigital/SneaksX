import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Browser client for client-side operations
export const createSupabaseBrowserClient = () => {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
};

// Standard client for client-side operations (legacy support)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

// Auth configuration
export const authConfig = {
  // Sign in options
  signIn: {
    email: true,
    phone: false,
  },

  // Sign up options
  signUp: {
    email: true,
    phone: false,
    requireEmailConfirmation: true,
  },

  // Social providers
  providers: {
    google: {
      enabled: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === 'true',
      redirectUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
    github: {
      enabled: process.env.NEXT_PUBLIC_ENABLE_GITHUB_AUTH === 'true',
      redirectUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  },

  // Password requirements
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
  },

  // Session configuration
  session: {
    maxAge: 3600, // 1 hour
    updateAge: 300, // 5 minutes
    autoRefresh: true,
  },

  // Redirect URLs
  redirectUrls: {
    signIn: '/dashboard',
    signUp: '/dashboard',
    signOut: '/',
    emailConfirmation: '/auth/confirm',
    passwordReset: '/auth/reset-password',
  },
};

// Database table names for type safety
export const TABLE_NAMES = {
  USERS: 'users',
  USER_ADDRESSES: 'user_addresses',
  USER_WATCHLIST: 'user_watchlist',
  ORDERS: 'orders',
  ORDER_ITEMS: 'order_items',
  SHOPPING_CART: 'shopping_cart',
  AUDIT_LOGS: 'audit_logs',
} as const;

// Auth-related database operations
export class AuthDatabaseService {
  constructor(private client = supabase) {}

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string) {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Create user profile after signup
   */
  async createUserProfile(userData: {
    id: string;
    email: string;
    full_name: string;
    role?: 'user' | 'vendor' | 'admin';
    phone?: string;
  }) {
    const { data, error } = await this.client
      .from('users')
      .insert({
        ...userData,
        role: userData.role || 'user',
        is_active: true,
        email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create user profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: {
    full_name?: string;
    phone?: string;
    date_of_birth?: string;
    avatar_url?: string;
  }) {
    const { data, error } = await this.client
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update user profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Update user email verification status
   */
  async markEmailAsVerified(userId: string) {
    const { error } = await this.client
      .from('users')
      .update({
        email_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to mark email as verified: ${error.message}`);
    }
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(userId: string) {
    const { error } = await this.client
      .from('users')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to deactivate user: ${error.message}`);
    }
  }

  /**
   * Log audit event
   */
  async logAuditEvent(event: {
    event_type: string;
    entity_type: string;
    entity_id?: string;
    user_id?: string;
    session_id?: string;
    ip_address?: string;
    user_agent?: string;
    action: string;
    old_values?: Record<string, any>;
    new_values?: Record<string, any>;
    metadata?: Record<string, any>;
    severity: 'info' | 'warning' | 'error' | 'critical';
    source: string;
  }) {
    const { error } = await this.client
      .from('audit_logs')
      .insert({
        ...event,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw error for audit logs to prevent disrupting main flow
    }
  }
}

export const authDbService = new AuthDatabaseService();
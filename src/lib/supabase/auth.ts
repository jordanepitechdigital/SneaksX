import { supabase } from './client'
import { User, AuthError } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string
  user_metadata?: {
    full_name?: string
    avatar_url?: string
  }
}

export interface SignUpData {
  email: string
  password: string
  fullName?: string
}

export interface SignInData {
  email: string
  password: string
}

// Sign up new user
export async function signUp({ email, password, fullName }: SignUpData) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (error) throw error
    return { user: data.user, error: null }
  } catch (error) {
    console.error('Sign up error:', error)
    return { user: null, error: error as AuthError }
  }
}

// Sign in existing user
export async function signIn({ email, password }: SignInData) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error
    return { user: data.user, error: null }
  } catch (error) {
    console.error('Sign in error:', error)
    return { user: null, error: error as AuthError }
  }
}

// Sign out current user
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Sign out error:', error)
    return { error: error as AuthError }
  }
}

// Get current user
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    return user
  } catch (error) {
    console.error('Get current user error:', error)
    return null
  }
}

// Update user profile
export async function updateProfile(updates: {
  full_name?: string
  avatar_url?: string
}) {
  try {
    const { data, error } = await supabase.auth.updateUser({
      data: updates
    })

    if (error) throw error
    return { user: data.user, error: null }
  } catch (error) {
    console.error('Update profile error:', error)
    return { user: null, error: error as AuthError }
  }
}

// Reset password
export async function resetPassword(email: string) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Reset password error:', error)
    return { error: error as AuthError }
  }
}

// Listen to auth state changes
export function onAuthStateChange(callback: (user: User | null) => void) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null)
  })
}
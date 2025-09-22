import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { type Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const createSupabaseServerClient = (cookieStore?: ReturnType<typeof cookies>) => {
  const cookieStoreInstance = cookieStore || cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStoreInstance.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        try {
          cookieStoreInstance.set({ name, value, ...options });
        } catch (error) {
          // The `set` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
      remove(name: string, options: any) {
        try {
          cookieStoreInstance.set({ name, value: '', ...options });
        } catch (error) {
          // The `delete` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
};

export const getSupabaseServerSession = async () => {
  const supabase = createSupabaseServerClient();

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error('Error getting session:', error);
      return null;
    }

    return session;
  } catch (error) {
    console.error('Error in getSupabaseServerSession:', error);
    return null;
  }
};

export const getSupabaseServerUser = async () => {
  const supabase = createSupabaseServerClient();

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.error('Error getting user:', error);
      return null;
    }

    return user;
  } catch (error) {
    console.error('Error in getSupabaseServerUser:', error);
    return null;
  }
};

export const getSupabaseServerProfile = async () => {
  const supabase = createSupabaseServerClient();
  const user = await getSupabaseServerUser();

  if (!user) {
    return null;
  }

  try {
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error getting user profile:', error);
      return null;
    }

    return profile;
  } catch (error) {
    console.error('Error in getSupabaseServerProfile:', error);
    return null;
  }
};
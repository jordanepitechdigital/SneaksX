import { type EmailOtpType } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/dashboard';

  if (token_hash && type) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.delete({ name, ...options });
          },
        },
      }
    );

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        type,
        token_hash,
      });

      if (!error && data.user) {
        // Update email verification status in our database
        if (type === 'email') {
          await supabase
            .from('users')
            .update({
              email_verified: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.user.id);
        }

        // Redirect based on the type of confirmation
        let redirectPath = next;
        if (type === 'recovery') {
          redirectPath = '/auth/reset-password';
        } else if (type === 'email') {
          redirectPath = '/auth/email-confirmed';
        }

        return NextResponse.redirect(new URL(redirectPath, request.url));
      }
    } catch (error) {
      console.error('Email confirmation error:', error);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(new URL('/auth/auth-code-error', request.url));
}
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          supabaseResponse.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: any) {
          supabaseResponse.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  // Get session and user
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  // Define route access rules
  const publicRoutes = [
    '/',
    '/about',
    '/contact',
    '/terms',
    '/privacy',
    '/products',
    '/brands',
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify-email',
    '/auth/confirm',
    '/auth/callback',
  ];

  const authRoutes = [
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
  ];

  const protectedRoutes = [
    '/dashboard',
    '/profile',
    '/watchlist',
    '/orders',
    '/cart',
    '/checkout',
    '/settings',
    '/notifications',
  ];

  const vendorRoutes = [
    '/vendor',
    '/vendor/dashboard',
    '/vendor/inventory',
    '/vendor/sales',
    '/vendor/products',
    '/vendor/analytics',
  ];

  const adminRoutes = [
    '/admin',
    '/admin/dashboard',
    '/admin/users',
    '/admin/products',
    '/admin/orders',
    '/admin/analytics',
    '/admin/system',
  ];

  // Check if route is public
  const isPublicRoute = publicRoutes.some(route => {
    if (route.includes('[') || route.includes('*')) {
      // Handle dynamic routes
      const routePattern = route.replace(/\[.*?\]/g, '[^/]+').replace(/\*/g, '.*');
      const regex = new RegExp(`^${routePattern}$`);
      return regex.test(pathname);
    }
    return pathname === route || pathname.startsWith(route + '/');
  });

  // Check if route requires authentication
  const isProtectedRoute = protectedRoutes.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  );

  const isVendorRoute = vendorRoutes.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  );

  const isAdminRoute = adminRoutes.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  );

  const isAuthRoute = authRoutes.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  );

  // Redirect authenticated users away from auth pages
  if (session && isAuthRoute) {
    const redirectUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // Handle protected routes
  if (!session && (isProtectedRoute || isVendorRoute || isAdminRoute)) {
    const redirectUrl = new URL('/auth/login', request.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Handle role-based access
  if (session) {
    try {
      // Get user profile to check role
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        // Check vendor route access
        if (isVendorRoute && !['vendor', 'admin'].includes(profile.role)) {
          const redirectUrl = new URL('/unauthorized', request.url);
          return NextResponse.redirect(redirectUrl);
        }

        // Check admin route access
        if (isAdminRoute && profile.role !== 'admin') {
          const redirectUrl = new URL('/unauthorized', request.url);
          return NextResponse.redirect(redirectUrl);
        }
      }
    } catch (error) {
      console.error('Error checking user role:', error);
      // If we can't verify the role, redirect to login for security
      if (isVendorRoute || isAdminRoute) {
        const redirectUrl = new URL('/auth/login', request.url);
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  // Add security headers
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff');
  supabaseResponse.headers.set('X-Frame-Options', 'DENY');
  supabaseResponse.headers.set('X-XSS-Protection', '1; mode=block');
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  supabaseResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Add CSP header for additional security
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-src 'none'",
  ].join('; ');

  supabaseResponse.headers.set('Content-Security-Policy', cspHeader);

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
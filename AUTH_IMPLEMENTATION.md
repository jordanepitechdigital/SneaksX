# SneakX Authentication System Implementation

## Overview

This document outlines the complete authentication and authorization system implemented for SneakX. The system provides role-based access control, secure session management, and comprehensive security features.

## Architecture

### Core Components

1. **Supabase Integration**: Complete authentication with SSR support
2. **Role-Based Access Control**: Three-tier system (User, Vendor, Admin)
3. **Security Features**: Input validation, rate limiting, CSRF protection
4. **Session Management**: JWT tokens with automatic refresh
5. **UI Components**: Complete form library with validation

## File Structure

```
src/
├── lib/auth/
│   ├── client.ts              # Browser Supabase client
│   ├── server.ts              # Server-side Supabase client
│   ├── AuthProvider.tsx       # React context provider
│   └── security.ts            # Security utilities
├── hooks/auth/
│   ├── useAuth.ts             # Main auth hook
│   ├── useAuthActions.ts      # Auth actions (login/logout)
│   ├── useAuthGuard.ts        # Route protection hooks
│   ├── useAuthForm.ts         # Form validation hooks
│   └── index.ts               # Barrel exports
├── components/auth/
│   ├── LoginForm.tsx          # Login component
│   ├── RegisterForm.tsx       # Registration component
│   ├── ForgotPasswordForm.tsx # Password reset request
│   ├── ResetPasswordForm.tsx  # Password reset form
│   ├── ChangePasswordForm.tsx # Change password form
│   ├── UserProfile.tsx        # Profile management
│   ├── UserMenu.tsx           # User dropdown menu
│   ├── ProtectedRoute.tsx     # Route protection wrapper
│   ├── RoleGate.tsx           # Role-based UI rendering
│   └── index.ts               # Barrel exports
├── components/ui/
│   ├── Button.tsx             # Button component
│   ├── Input.tsx              # Input component
│   ├── Label.tsx              # Label component
│   └── Checkbox.tsx           # Checkbox component
├── types/
│   ├── auth.ts                # Authentication types
│   └── database.ts            # Database types
├── app/auth/
│   ├── callback/route.ts      # OAuth callback handler
│   └── confirm/route.ts       # Email confirmation handler
└── middleware.ts              # Next.js middleware for auth
```

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Site Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Auth Configuration (optional)
NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true
NEXT_PUBLIC_ENABLE_GITHUB_AUTH=true
```

### 2. Database Setup

The system assumes the following database tables exist:

- `users` - User profiles with role field
- `user_addresses` - User shipping/billing addresses
- `user_watchlist` - User product watchlists
- `audit_logs` - Security audit trail

### 3. Application Setup

1. **Wrap your app with AuthProvider**:

```tsx
// app/layout.tsx
import { AuthProvider } from '@/components/auth';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

2. **Configure middleware** (already created at `src/middleware.ts`)

## Usage Examples

### Basic Authentication

```tsx
// Login page
import { LoginForm } from '@/components/auth';

export default function LoginPage() {
  return <LoginForm />;
}
```

```tsx
// Register page
import { RegisterForm } from '@/components/auth';

export default function RegisterPage() {
  return <RegisterForm defaultRole="user" />;
}
```

### Protected Routes

```tsx
// Protected page component
import { ProtectedRoute } from '@/components/auth';

export default function DashboardPage() {
  return (
    <ProtectedRoute requiredRole={['user', 'vendor', 'admin']}>
      <div>Dashboard content</div>
    </ProtectedRoute>
  );
}
```

```tsx
// Admin-only page
import { RequireAdmin } from '@/components/auth';

export default function AdminPage() {
  return (
    <RequireAdmin>
      <div>Admin panel content</div>
    </RequireAdmin>
  );
}
```

### Role-Based UI

```tsx
// Conditional rendering based on role
import { RoleGate, AdminOnly, VendorOnly } from '@/components/auth';

export default function Header() {
  return (
    <nav>
      <AdminOnly>
        <Link href="/admin">Admin Panel</Link>
      </AdminOnly>

      <VendorOnly>
        <Link href="/vendor">Vendor Dashboard</Link>
      </VendorOnly>

      <RoleGate allowedRoles={['user', 'vendor']}>
        <Link href="/shop">Shop</Link>
      </RoleGate>
    </nav>
  );
}
```

### Using Auth Hooks

```tsx
// Component using auth hooks
import { useAuth, useAuthActions } from '@/hooks/auth';

export default function UserComponent() {
  const { user, isLoading, hasRole } = useAuth();
  const { logout } = useAuthActions();

  if (isLoading) return <div>Loading...</div>;
  if (!user) return <div>Please log in</div>;

  return (
    <div>
      <h1>Welcome, {user.profile.full_name}</h1>
      {hasRole('admin') && <p>You are an admin!</p>}
      <button onClick={logout}>Sign Out</button>
    </div>
  );
}
```

### Form Validation

```tsx
// Custom login form with validation
import { useLoginForm, useAuthActions } from '@/hooks/auth';

export default function CustomLoginForm() {
  const { form, isSubmitting, authError, handleSubmit } = useLoginForm();
  const { login } = useAuthActions();

  const onSubmit = handleSubmit(async (data) => {
    return await login(data);
  });

  return (
    <form onSubmit={onSubmit}>
      <input
        type="email"
        {...form.register('email')}
        placeholder="Email"
      />
      {form.formState.errors.email && (
        <p>{form.formState.errors.email.message}</p>
      )}

      <input
        type="password"
        {...form.register('password')}
        placeholder="Password"
      />
      {form.formState.errors.password && (
        <p>{form.formState.errors.password.message}</p>
      )}

      {authError && <p>{authError.message}</p>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
```

## Security Features

### 1. Input Validation

- Email format validation
- Password strength requirements
- Phone number validation
- Input sanitization against XSS

### 2. Rate Limiting

- Login attempts: 5 per 15 minutes
- Registration attempts: 3 per hour
- Password reset: 3 per hour

### 3. Security Headers

Automatically applied via middleware:
- Content Security Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection
- Referrer Policy

### 4. Session Security

- JWT tokens with automatic refresh
- Secure cookie settings
- Session timeout handling
- Browser fingerprinting for additional security

### 5. Audit Logging

All authentication events are logged to the `audit_logs` table:
- Login/logout events
- Profile updates
- Password changes
- Failed authentication attempts

## Role Permissions

### User Role
- Read own profile
- Update own profile
- Manage watchlist
- Place orders
- View own orders

### Vendor Role
- All user permissions
- Manage inventory
- View sales data
- Manage products
- View analytics

### Admin Role
- All vendor permissions
- Manage all users
- Manage all products
- Manage all orders
- System administration

## Error Handling

The system provides comprehensive error handling:

```tsx
// Error types
interface AuthError {
  message: string;
  code?: string;
  field?: string;
}

// Usage
const { error } = await login(credentials);
if (error) {
  console.log(error.message); // User-friendly message
  console.log(error.code);    // Error code for debugging
  console.log(error.field);   // Field that caused the error
}
```

## Testing

The authentication system can be tested with:

1. **Unit Tests**: Test individual hooks and utilities
2. **Integration Tests**: Test complete auth flows
3. **E2E Tests**: Test user journeys through the auth system

## Deployment Considerations

1. **HTTPS Required**: All authentication must use HTTPS in production
2. **Environment Variables**: Secure all sensitive environment variables
3. **Database Security**: Enable RLS policies on all tables
4. **Monitoring**: Set up monitoring for authentication events
5. **Backup**: Regular backups of user data

## Support

For issues or questions about the authentication system:

1. Check the component documentation
2. Review the TypeScript types for API contracts
3. Check the security utilities for additional features
4. Review the middleware configuration for route protection

## Future Enhancements

Potential improvements to consider:

1. **Two-Factor Authentication**: SMS or TOTP support
2. **Social Login**: Google/GitHub OAuth integration
3. **Advanced Permissions**: Granular permission system
4. **Device Management**: Track and manage user devices
5. **Advanced Analytics**: User behavior tracking
6. **Progressive Enhancement**: Offline auth support
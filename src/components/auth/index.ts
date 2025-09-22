// Auth Components Barrel Export
export { AuthProvider } from '@/lib/auth/AuthProvider';
export { LoginForm } from './LoginForm';
export { RegisterForm } from './RegisterForm';
export { ForgotPasswordForm } from './ForgotPasswordForm';
export { ResetPasswordForm } from './ResetPasswordForm';
export { ChangePasswordForm } from './ChangePasswordForm';
export { UserProfile } from './UserProfile';
export { UserMenu } from './UserMenu';

// Protected Route Components
export {
  ProtectedRoute,
  withProtection,
  RequireAuth,
  RequireRole,
  RequirePermission,
  RequireAdmin,
  RequireVendor,
  GuestOnly,
} from './ProtectedRoute';

// Role-based UI Components
export {
  RoleGate,
  AdminOnly,
  VendorOnly,
  UserOnly,
  PermissionGate,
} from './RoleGate';
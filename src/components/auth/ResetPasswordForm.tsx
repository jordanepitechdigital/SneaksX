'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useChangePasswordForm, useAuthActions } from '@/hooks/auth';
import { cn } from '@/lib/utils';

interface ResetPasswordFormProps {
  className?: string;
  onSuccess?: () => void;
}

export function ResetPasswordForm({ className, onSuccess }: ResetPasswordFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { form, isSubmitting, authError, handleSubmit, clearError } = useChangePasswordForm();
  const { updatePassword } = useAuthActions();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check if we have a valid reset token
  useEffect(() => {
    const token = searchParams.get('token');
    const type = searchParams.get('type');

    if (type !== 'recovery' || !token) {
      // Invalid or missing token, redirect to forgot password
      router.push('/auth/forgot-password');
    }
  }, [searchParams, router]);

  const onSubmit = handleSubmit(async (newPassword) => {
    clearError();
    const result = await updatePassword(newPassword);

    if (!result.error) {
      setIsSuccess(true);
      if (onSuccess) {
        onSuccess();
      }
      // Redirect to dashboard after successful password reset
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    }

    return result;
  });

  if (isSuccess) {
    return (
      <div className={cn('mx-auto max-w-sm space-y-6', className)}>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Password Reset Successful</h1>
            <p className="text-gray-500 dark:text-gray-400">
              Your password has been successfully updated. You&apos;re being redirected to your dashboard.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Button
            onClick={() => router.push('/dashboard')}
            className="w-full"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('mx-auto max-w-sm space-y-6', className)}>
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">Reset Password</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Create a new password for your account
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Current Password Field (Hidden - not needed for reset) */}
        <input
          type="hidden"
          {...form.register('currentPassword')}
          value="placeholder" // Supabase handles token validation
        />

        {/* New Password Field */}
        <div className="space-y-2">
          <Label htmlFor="newPassword">New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your new password"
              className="pl-9 pr-9"
              {...form.register('newPassword')}
              error={form.formState.errors.newPassword?.message}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Confirm Password Field */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm your new password"
              className="pl-9 pr-9"
              {...form.register('confirmPassword')}
              error={form.formState.errors.confirmPassword?.message}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Password Requirements */}
        <div className="space-y-1 text-xs text-gray-600">
          <p>Password must contain:</p>
          <ul className="ml-4 space-y-1">
            <li>• At least 8 characters</li>
            <li>• One uppercase letter</li>
            <li>• One lowercase letter</li>
            <li>• One number</li>
          </ul>
        </div>

        {/* Error Message */}
        {authError && (
          <div className="rounded-md bg-destructive/15 p-3">
            <p className="text-sm text-destructive">{authError.message}</p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Updating password...' : 'Update Password'}
        </Button>

        {/* Back to Login */}
        <div className="text-center">
          <Link
            href="/auth/login"
            className="text-sm text-primary hover:underline"
          >
            Back to Sign In
          </Link>
        </div>
      </form>
    </div>
  );
}
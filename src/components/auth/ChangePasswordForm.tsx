'use client';

import { useState } from 'react';
import { Eye, EyeOff, Lock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useChangePasswordForm, useAuthActions } from '@/hooks/auth';
import { cn } from '@/lib/utils';

interface ChangePasswordFormProps {
  className?: string;
  onSuccess?: () => void;
}

export function ChangePasswordForm({ className, onSuccess }: ChangePasswordFormProps) {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { form, isSubmitting, authError, isSuccess, handleSubmit, clearError, resetForm } = useChangePasswordForm();
  const { updatePassword } = useAuthActions();

  const onSubmit = handleSubmit(async (newPassword) => {
    clearError();
    const result = await updatePassword(newPassword);

    if (!result.error) {
      resetForm();
      if (onSuccess) {
        onSuccess();
      }
    }

    return result;
  });

  if (isSuccess) {
    return (
      <div className={cn('max-w-md mx-auto p-6 space-y-6', className)}>
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Shield className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Password Updated</h2>
            <p className="text-muted-foreground">
              Your password has been successfully changed.
            </p>
          </div>
          <Button
            onClick={resetForm}
            variant="outline"
            className="w-full"
          >
            Change Password Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('max-w-md mx-auto p-6 space-y-6', className)}>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Change Password</h2>
        <p className="text-muted-foreground">
          Update your password to keep your account secure.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Current Password */}
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              id="currentPassword"
              type={showCurrentPassword ? 'text' : 'password'}
              placeholder="Enter your current password"
              className="pl-9 pr-9"
              {...form.register('currentPassword')}
              error={form.formState.errors.currentPassword?.message}
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showCurrentPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div className="space-y-2">
          <Label htmlFor="newPassword">New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              id="newPassword"
              type={showNewPassword ? 'text' : 'password'}
              placeholder="Enter your new password"
              className="pl-9 pr-9"
              {...form.register('newPassword')}
              error={form.formState.errors.newPassword?.message}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showNewPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Confirm New Password */}
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
          <p>New password must contain:</p>
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
      </form>
    </div>
  );
}
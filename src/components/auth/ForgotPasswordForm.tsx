'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useResetPasswordForm, useAuthActions } from '@/hooks/auth';
import { cn } from '@/lib/utils';

interface ForgotPasswordFormProps {
  className?: string;
  onSuccess?: () => void;
}

export function ForgotPasswordForm({ className, onSuccess }: ForgotPasswordFormProps) {
  const { form, isSubmitting, authError, isSuccess, handleSubmit, clearError, resetForm } = useResetPasswordForm();
  const { forgotPassword } = useAuthActions();

  const onSubmit = handleSubmit(async (email) => {
    clearError();
    const result = await forgotPassword(email);

    if (!result.error && onSuccess) {
      onSuccess();
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
            <h1 className="text-2xl font-bold">Check Your Email</h1>
            <p className="text-gray-500 dark:text-gray-400">
              We&apos;ve sent a password reset link to your email address.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-md bg-blue-50 dark:bg-blue-900/30 p-4">
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium">What to do next:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Check your email inbox (and spam folder)</li>
                <li>Click the reset link in the email</li>
                <li>Create a new password</li>
                <li>Sign in with your new password</li>
              </ol>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={resetForm}
              variant="outline"
              className="w-full"
            >
              Send Another Email
            </Button>
            <Link
              href="/auth/login"
              className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('mx-auto max-w-sm space-y-6', className)}>
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">Forgot Password?</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              id="email"
              type="email"
              placeholder="Enter your email address"
              className="pl-9"
              {...form.register('email')}
              error={form.formState.errors.email?.message}
            />
          </div>
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
          {isSubmitting ? 'Sending reset link...' : 'Send Reset Link'}
        </Button>

        {/* Back to Login */}
        <div className="text-center">
          <Link
            href="/auth/login"
            className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Sign In
          </Link>
        </div>
      </form>
    </div>
  );
}
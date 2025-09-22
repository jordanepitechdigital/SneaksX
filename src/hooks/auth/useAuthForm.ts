import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { LoginCredentials, RegisterCredentials, AuthError } from '@/types/auth';

// Login form validation schema
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional(),
});

// Register form validation schema
const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be less than 100 characters'),
  phone: z
    .string()
    .optional()
    .refine((phone) => !phone || /^\+?[\d\s-()]+$/.test(phone), {
      message: 'Please enter a valid phone number',
    }),
  role: z.enum(['user', 'vendor']).optional(),
  agreeToTerms: z
    .boolean()
    .refine((val) => val === true, {
      message: 'You must agree to the terms and conditions',
    }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Password reset form validation schema
const resetPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
});

// Change password form validation schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export function useLoginForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);

  const form = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const handleSubmit = useCallback(async (
    onSubmit: (data: LoginCredentials) => Promise<{ error?: AuthError }>
  ) => {
    return form.handleSubmit(async (data) => {
      setIsSubmitting(true);
      setAuthError(null);

      try {
        const result = await onSubmit(data);

        if (result.error) {
          setAuthError(result.error);

          // Set form field errors if applicable
          if (result.error.field) {
            form.setError(result.error.field as keyof LoginCredentials, {
              message: result.error.message,
            });
          }
        }
      } catch (error) {
        setAuthError({
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      } finally {
        setIsSubmitting(false);
      }
    });
  }, [form]);

  const clearError = useCallback(() => {
    setAuthError(null);
  }, []);

  return {
    form,
    isSubmitting,
    authError,
    handleSubmit,
    clearError,
  };
}

export function useRegisterForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);

  const form = useForm<RegisterCredentials>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      fullName: '',
      phone: '',
      role: 'user',
      agreeToTerms: false,
    },
  });

  const handleSubmit = useCallback(async (
    onSubmit: (data: RegisterCredentials) => Promise<{ error?: AuthError }>
  ) => {
    return form.handleSubmit(async (data) => {
      setIsSubmitting(true);
      setAuthError(null);

      try {
        const result = await onSubmit(data);

        if (result.error) {
          setAuthError(result.error);

          // Set form field errors if applicable
          if (result.error.field) {
            form.setError(result.error.field as keyof RegisterCredentials, {
              message: result.error.message,
            });
          }
        }
      } catch (error) {
        setAuthError({
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      } finally {
        setIsSubmitting(false);
      }
    });
  }, [form]);

  const clearError = useCallback(() => {
    setAuthError(null);
  }, []);

  return {
    form,
    isSubmitting,
    authError,
    handleSubmit,
    clearError,
  };
}

export function useResetPasswordForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<{ email: string }>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const handleSubmit = useCallback(async (
    onSubmit: (email: string) => Promise<{ error?: AuthError }>
  ) => {
    return form.handleSubmit(async (data) => {
      setIsSubmitting(true);
      setAuthError(null);
      setIsSuccess(false);

      try {
        const result = await onSubmit(data.email);

        if (result.error) {
          setAuthError(result.error);
        } else {
          setIsSuccess(true);
          form.reset();
        }
      } catch (error) {
        setAuthError({
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      } finally {
        setIsSubmitting(false);
      }
    });
  }, [form]);

  const clearError = useCallback(() => {
    setAuthError(null);
  }, []);

  const resetForm = useCallback(() => {
    form.reset();
    setAuthError(null);
    setIsSuccess(false);
  }, [form]);

  return {
    form,
    isSubmitting,
    authError,
    isSuccess,
    handleSubmit,
    clearError,
    resetForm,
  };
}

export function useChangePasswordForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<{
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const handleSubmit = useCallback(async (
    onSubmit: (newPassword: string) => Promise<{ error?: AuthError }>
  ) => {
    return form.handleSubmit(async (data) => {
      setIsSubmitting(true);
      setAuthError(null);
      setIsSuccess(false);

      try {
        const result = await onSubmit(data.newPassword);

        if (result.error) {
          setAuthError(result.error);
        } else {
          setIsSuccess(true);
          form.reset();
        }
      } catch (error) {
        setAuthError({
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      } finally {
        setIsSubmitting(false);
      }
    });
  }, [form]);

  const clearError = useCallback(() => {
    setAuthError(null);
  }, []);

  const resetForm = useCallback(() => {
    form.reset();
    setAuthError(null);
    setIsSuccess(false);
  }, [form]);

  return {
    form,
    isSubmitting,
    authError,
    isSuccess,
    handleSubmit,
    clearError,
    resetForm,
  };
}
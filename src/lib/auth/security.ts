import { AuthError } from '@/types/auth';

// Password validation utilities
export const PASSWORD_REGEX = {
  MIN_LENGTH: /.{8,}/,
  UPPERCASE: /[A-Z]/,
  LOWERCASE: /[a-z]/,
  NUMBER: /[0-9]/,
  SPECIAL_CHAR: /[^A-Za-z0-9]/,
};

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!PASSWORD_REGEX.MIN_LENGTH.test(password)) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!PASSWORD_REGEX.UPPERCASE.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!PASSWORD_REGEX.LOWERCASE.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!PASSWORD_REGEX.NUMBER.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Calculate strength
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  const score = [
    PASSWORD_REGEX.MIN_LENGTH.test(password),
    PASSWORD_REGEX.UPPERCASE.test(password),
    PASSWORD_REGEX.LOWERCASE.test(password),
    PASSWORD_REGEX.NUMBER.test(password),
    PASSWORD_REGEX.SPECIAL_CHAR.test(password),
    password.length >= 12,
  ].filter(Boolean).length;

  if (score >= 5) {
    strength = 'strong';
  } else if (score >= 3) {
    strength = 'medium';
  }

  return {
    isValid: errors.length === 0,
    errors,
    strength,
  };
}

// Email validation
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Phone validation
export function validatePhone(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s-()]{10,}$/;
  return phoneRegex.test(phone);
}

// Sanitize user input
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential XSS characters
    .substring(0, 1000); // Limit length
}

// Rate limiting utilities
interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(private config: RateLimitConfig) {}

  isRateLimited(identifier: string): boolean {
    const now = Date.now();
    const attempt = this.attempts.get(identifier);

    if (!attempt) {
      this.attempts.set(identifier, { count: 1, resetTime: now + this.config.windowMs });
      return false;
    }

    if (now > attempt.resetTime) {
      // Reset window
      this.attempts.set(identifier, { count: 1, resetTime: now + this.config.windowMs });
      return false;
    }

    if (attempt.count >= this.config.maxAttempts) {
      return true;
    }

    attempt.count++;
    return false;
  }

  getRemainingTime(identifier: string): number {
    const attempt = this.attempts.get(identifier);
    if (!attempt) return 0;

    const now = Date.now();
    return Math.max(0, attempt.resetTime - now);
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

// Create rate limiters for different actions
export const authRateLimiters = {
  login: new RateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 }), // 5 attempts per 15 minutes
  register: new RateLimiter({ maxAttempts: 3, windowMs: 60 * 60 * 1000 }), // 3 attempts per hour
  resetPassword: new RateLimiter({ maxAttempts: 3, windowMs: 60 * 60 * 1000 }), // 3 attempts per hour
};

// Session security utilities
export function generateSecureToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function isSecureContext(): boolean {
  return typeof window !== 'undefined' && (
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
}

// CSRF protection
export function generateCSRFToken(): string {
  return generateSecureToken();
}

export function validateCSRFToken(token: string, expected: string): boolean {
  return token === expected;
}

// Input sanitization for XSS prevention
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// SQL injection prevention for user queries
export function sanitizeForSearch(query: string): string {
  return query
    .replace(/['"\\;]/g, '') // Remove quotes and escape characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 100); // Limit length
}

// Security headers utility
export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

// Auth error handling
export function normalizeAuthError(error: any): AuthError {
  if (typeof error === 'string') {
    return { message: error };
  }

  if (error?.message) {
    return {
      message: error.message,
      code: error.code || undefined,
    };
  }

  return { message: 'An unexpected error occurred' };
}

// Browser fingerprinting for additional security
export function getBrowserFingerprint(): string {
  if (typeof window === 'undefined') return '';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Browser fingerprint', 2, 2);
  }

  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvas.toDataURL(),
  ].join('|');

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(16);
}

// Session timeout utility
export class SessionTimeout {
  private timeoutId: NodeJS.Timeout | null = null;
  private warningTimeoutId: NodeJS.Timeout | null = null;

  constructor(
    private timeoutMs: number,
    private warningMs: number,
    private onWarning: () => void,
    private onTimeout: () => void
  ) {}

  start(): void {
    this.reset();
  }

  reset(): void {
    this.clear();

    this.warningTimeoutId = setTimeout(() => {
      this.onWarning();
    }, this.timeoutMs - this.warningMs);

    this.timeoutId = setTimeout(() => {
      this.onTimeout();
    }, this.timeoutMs);
  }

  clear(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.warningTimeoutId) {
      clearTimeout(this.warningTimeoutId);
      this.warningTimeoutId = null;
    }
  }

  extend(additionalMs: number): void {
    this.timeoutMs += additionalMs;
    this.reset();
  }
}
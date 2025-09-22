import crypto from 'crypto';

export interface WebhookVerificationResult {
  isValid: boolean;
  error?: string;
}

export class WebhookSecurity {
  private readonly secret: string;
  private readonly algorithm = 'sha256';

  constructor(secret?: string) {
    this.secret = secret || process.env.KICKSDB_WEBHOOK_SECRET || '';
    if (!this.secret) {
      throw new Error('Webhook secret is required for signature verification');
    }
  }

  /**
   * Verify webhook signature using HMAC-SHA256
   * Expected signature format: "sha256=<hex_signature>"
   */
  verifySignature(payload: string | Buffer, signature: string): WebhookVerificationResult {
    try {
      if (!signature) {
        return { isValid: false, error: 'Missing signature' };
      }

      // Parse signature format (e.g., "sha256=abc123...")
      const signatureParts = signature.split('=');
      if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
        return { isValid: false, error: 'Invalid signature format' };
      }

      const providedSignature = signatureParts[1];
      const expectedSignature = this.generateSignature(payload);

      // Use constant-time comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(providedSignature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );

      return { isValid };
    } catch (error) {
      return {
        isValid: false,
        error: `Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Generate HMAC-SHA256 signature for payload
   */
  private generateSignature(payload: string | Buffer): string {
    return crypto
      .createHmac(this.algorithm, this.secret)
      .update(payload, typeof payload === 'string' ? 'utf8' : undefined)
      .digest('hex');
  }

  /**
   * Validate webhook timestamp to prevent replay attacks
   * Rejects webhooks older than 5 minutes
   */
  validateTimestamp(timestamp: string | number, toleranceMs: number = 5 * 60 * 1000): boolean {
    try {
      const webhookTime = typeof timestamp === 'string' ? parseInt(timestamp) * 1000 : timestamp;
      const currentTime = Date.now();
      const timeDiff = Math.abs(currentTime - webhookTime);

      return timeDiff <= toleranceMs;
    } catch {
      return false;
    }
  }

  /**
   * Extract and validate webhook headers
   */
  validateHeaders(headers: Record<string, string | string[] | undefined>): {
    signature?: string;
    timestamp?: string;
    eventId?: string;
    error?: string;
  } {
    const signature = this.getHeader(headers, 'x-kicksdb-signature');
    const timestamp = this.getHeader(headers, 'x-kicksdb-timestamp');
    const eventId = this.getHeader(headers, 'x-kicksdb-event-id');

    if (!signature) {
      return { error: 'Missing signature header' };
    }

    if (!eventId) {
      return { error: 'Missing event ID header' };
    }

    return { signature, timestamp, eventId };
  }

  private getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const value = headers[key] || headers[key.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}

// Rate limiting for webhook endpoints
export class WebhookRateLimit {
  private readonly requests = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if request is within rate limit
   */
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing requests for this identifier
    const userRequests = this.requests.get(identifier) || [];

    // Filter out old requests outside the window
    const recentRequests = userRequests.filter(timestamp => timestamp > windowStart);

    // Check if under limit
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request and update
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);

    return true;
  }

  /**
   * Get remaining requests for identifier
   */
  getRemaining(identifier: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const userRequests = this.requests.get(identifier) || [];
    const recentRequests = userRequests.filter(timestamp => timestamp > windowStart);

    return Math.max(0, this.maxRequests - recentRequests.length);
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [identifier, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(timestamp => timestamp > windowStart);
      if (recentRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, recentRequests);
      }
    }
  }
}

// Circuit breaker for external service calls
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60 * 1000,
    private readonly resetTimeout: number = 30 * 1000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  getState(): string {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}
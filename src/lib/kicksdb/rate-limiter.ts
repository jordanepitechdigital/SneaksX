/**
 * Rate limiter for KicksDB API
 * Handles 640 requests per minute limit
 */
export class RateLimiter {
  private requests: number[] = [];
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number = 640, windowMs: number = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request can be made and track it
   */
  async canMakeRequest(): Promise<boolean> {
    const now = Date.now();

    // Remove requests outside the current window
    this.requests = this.requests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    // Check if we're within limits
    if (this.requests.length >= this.limit) {
      return false;
    }

    // Track this request
    this.requests.push(now);
    return true;
  }

  /**
   * Wait until a request can be made
   */
  async waitForAvailability(): Promise<void> {
    while (!(await this.canMakeRequest())) {
      // Calculate wait time until oldest request expires
      const now = Date.now();
      const oldestRequest = Math.min(...this.requests);
      const waitTime = Math.max(100, oldestRequest + this.windowMs - now);

      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Get current rate limit status
   */
  getStatus(): { remaining: number; resetTime: number } {
    const now = Date.now();
    this.requests = this.requests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    const remaining = Math.max(0, this.limit - this.requests.length);
    const oldestRequest = this.requests.length > 0 ? Math.min(...this.requests) : now;
    const resetTime = oldestRequest + this.windowMs;

    return { remaining, resetTime };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = [];
  }
}
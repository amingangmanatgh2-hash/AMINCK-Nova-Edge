/**
 * Token-bucket rate limiter.
 *
 * Each client key owns a bucket of `capacity` tokens that refills continuously
 * at `capacity / windowMs` tokens per millisecond, which smooths bursts instead
 * of resetting hard at window boundaries.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimiterOptions {
  /** Tokens available per window. */
  readonly capacity: number;
  /** Window length in ms over which the bucket fully refills. */
  readonly windowMs: number;
  /** Injectable clock, in ms. */
  readonly now?: () => number;
}

/** Outcome of a rate-limit check. */
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  /** Seconds until at least one token is available; `0` when allowed. */
  readonly retryAfterSeconds: number;
  /** Epoch ms at which the bucket is expected to be full again. */
  readonly resetAt: number;
}

/** Per-key token-bucket limiter. */
export class RateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #capacity: number;
  readonly #windowMs: number;
  readonly #refillPerMs: number;
  readonly #now: () => number;

  public constructor(options: RateLimiterOptions) {
    const { capacity, windowMs } = options;
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`capacity must be a positive integer, received ${capacity}`);
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new RangeError(`windowMs must be a positive number, received ${windowMs}`);
    }
    this.#capacity = capacity;
    this.#windowMs = windowMs;
    this.#refillPerMs = capacity / windowMs;
    this.#now = options.now ?? Date.now;
  }

  /** Number of keys currently tracked. */
  public get size(): number {
    return this.#buckets.size;
  }

  /** Tokens available per window. */
  public get capacity(): number {
    return this.#capacity;
  }

  /** Window length in ms over which a bucket fully refills. */
  public get windowMs(): number {
    return this.#windowMs;
  }

  /** Consume one token for `key` and report whether the request may proceed. */
  public consume(key: string, cost = 1): RateLimitResult {
    if (!Number.isFinite(cost) || cost <= 0) {
      throw new RangeError(`cost must be a positive number, received ${cost}`);
    }
    const now = this.#now();
    const bucket = this.#refill(key, now);

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return {
        allowed: true,
        limit: this.#capacity,
        remaining: Math.floor(bucket.tokens),
        retryAfterSeconds: 0,
        resetAt: this.#resetAt(bucket, now),
      };
    }

    const deficit = cost - bucket.tokens;
    const waitMs = deficit / this.#refillPerMs;
    return {
      allowed: false,
      limit: this.#capacity,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
      resetAt: this.#resetAt(bucket, now),
    };
  }

  /** Inspect remaining tokens without consuming any. */
  public peek(key: string): number {
    return Math.floor(this.#refill(key, this.#now()).tokens);
  }

  /** Forget a single key. */
  public reset(key: string): void {
    this.#buckets.delete(key);
  }

  /** Forget every key. */
  public resetAll(): void {
    this.#buckets.clear();
  }

  /** Drop buckets that have fully refilled — they carry no state worth keeping. */
  public sweep(): number {
    const now = this.#now();
    let removed = 0;
    for (const [key, bucket] of this.#buckets) {
      const refilled = Math.min(
        this.#capacity,
        bucket.tokens + (now - bucket.updatedAt) * this.#refillPerMs,
      );
      if (refilled >= this.#capacity) {
        this.#buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  #refill(key: string, now: number): Bucket {
    const existing = this.#buckets.get(key);
    if (existing === undefined) {
      const created: Bucket = { tokens: this.#capacity, updatedAt: now };
      this.#buckets.set(key, created);
      return created;
    }
    const elapsed = Math.max(0, now - existing.updatedAt);
    existing.tokens = Math.min(this.#capacity, existing.tokens + elapsed * this.#refillPerMs);
    existing.updatedAt = now;
    return existing;
  }

  #resetAt(bucket: Bucket, now: number): number {
    const missing = this.#capacity - bucket.tokens;
    if (missing <= 0) {
      return now;
    }
    return now + Math.ceil(missing / this.#refillPerMs);
  }
}

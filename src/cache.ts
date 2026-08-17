/**
 * In-memory cache combining TTL expiry with LRU eviction.
 *
 * `Map` preserves insertion order, so re-inserting a key on read moves it to
 * the most-recently-used position and the oldest key is always `keys().next()`.
 */

interface Entry<V> {
  readonly value: V;
  readonly expiresAt: number;
}

export interface CacheOptions {
  /** Maximum number of live entries before LRU eviction kicks in. */
  readonly maxEntries?: number;
  /** Default time-to-live in ms. `0` means "never expire". */
  readonly ttlMs?: number;
  /** Injectable clock, in ms. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Snapshot of cache counters. */
export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly expirations: number;
  readonly size: number;
}

/** TTL + LRU cache. */
export class TtlCache<V> {
  readonly #entries = new Map<string, Entry<V>>();
  readonly #maxEntries: number;
  readonly #ttlMs: number;
  readonly #now: () => number;

  #hits = 0;
  #misses = 0;
  #evictions = 0;
  #expirations = 0;

  public constructor(options: CacheOptions = {}) {
    const maxEntries = options.maxEntries ?? 500;
    const ttlMs = options.ttlMs ?? 30_000;
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError(`maxEntries must be a positive integer, received ${maxEntries}`);
    }
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new RangeError(`ttlMs must be a non-negative number, received ${ttlMs}`);
    }
    this.#maxEntries = maxEntries;
    this.#ttlMs = ttlMs;
    this.#now = options.now ?? Date.now;
  }

  /** Live entry count, excluding entries that have already expired. */
  public get size(): number {
    this.prune();
    return this.#entries.size;
  }

  /** Read a value, refreshing its LRU position on hit. */
  public get(key: string): V | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      this.#misses += 1;
      return undefined;
    }
    if (this.#isExpired(entry)) {
      this.#entries.delete(key);
      this.#expirations += 1;
      this.#misses += 1;
      return undefined;
    }
    // Refresh recency.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    this.#hits += 1;
    return entry.value;
  }

  /** Whether a live (non-expired) value exists, without affecting counters. */
  public has(key: string): boolean {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return false;
    }
    if (this.#isExpired(entry)) {
      this.#entries.delete(key);
      this.#expirations += 1;
      return false;
    }
    return true;
  }

  /** Insert or replace a value, optionally overriding the default TTL. */
  public set(key: string, value: V, ttlMs?: number): this {
    const effectiveTtl = ttlMs ?? this.#ttlMs;
    if (!Number.isFinite(effectiveTtl) || effectiveTtl < 0) {
      throw new RangeError(`ttlMs must be a non-negative number, received ${ttlMs}`);
    }
    if (this.#entries.has(key)) {
      this.#entries.delete(key);
    }
    this.#entries.set(key, {
      value,
      expiresAt: effectiveTtl === 0 ? Number.POSITIVE_INFINITY : this.#now() + effectiveTtl,
    });
    this.#evictOverflow();
    return this;
  }

  /** Read-through helper: compute and store the value when absent. */
  public async getOrSet(key: string, factory: () => V | Promise<V>, ttlMs?: number): Promise<V> {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created = await factory();
    this.set(key, created, ttlMs);
    return created;
  }

  public delete(key: string): boolean {
    return this.#entries.delete(key);
  }

  public clear(): void {
    this.#entries.clear();
  }

  /** Drop every expired entry. Returns how many were removed. */
  public prune(): number {
    let removed = 0;
    for (const [key, entry] of this.#entries) {
      if (this.#isExpired(entry)) {
        this.#entries.delete(key);
        removed += 1;
      }
    }
    this.#expirations += removed;
    return removed;
  }

  public stats(): CacheStats {
    return {
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
      expirations: this.#expirations,
      size: this.#entries.size,
    };
  }

  public resetStats(): void {
    this.#hits = 0;
    this.#misses = 0;
    this.#evictions = 0;
    this.#expirations = 0;
  }

  #isExpired(entry: Entry<V>): boolean {
    return entry.expiresAt <= this.#now();
  }

  #evictOverflow(): void {
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done === true) {
        return;
      }
      this.#entries.delete(oldest.value);
      this.#evictions += 1;
    }
  }
}

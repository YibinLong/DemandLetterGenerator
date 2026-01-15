// In-memory cache service for API response caching
// Provides a simple, fast caching layer for frequently accessed data

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  etag: string;
}

interface CacheOptions {
  ttlSeconds?: number;
  maxEntries?: number;
}

const DEFAULT_TTL_SECONDS = 60; // 1 minute default
const DEFAULT_MAX_ENTRIES = 1000;

class CacheService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private maxEntries: number;
  private hits = 0;
  private misses = 0;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;

    // Periodic cleanup of expired entries
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Generate ETag from data
   */
  private generateEtag(data: unknown): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `"${Math.abs(hash).toString(16)}"`;
  }

  /**
   * Get cached data
   */
  get<T>(key: string): { data: T; etag: string } | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return { data: entry.data, etag: entry.etag };
  }

  /**
   * Set cached data
   */
  set<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL_SECONDS): string {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxEntries) {
      const keysIterator = this.cache.keys();
      const firstKey = keysIterator.next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const etag = this.generateEtag(data);

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000),
      etag,
    });

    return etag;
  }

  /**
   * Delete cached data by key pattern
   */
  invalidate(pattern: string | RegExp): number {
    let deletedCount = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxEntries: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// Singleton cache instance
export const cache = new CacheService({ maxEntries: 2000 });

// Cache key generators for different resources
export const cacheKeys = {
  demandLetterList: (firmId: string, params: Record<string, unknown>) =>
    `demand-letters:${firmId}:${JSON.stringify(params)}`,

  demandLetter: (id: string) => `demand-letter:${id}`,

  templateList: (firmId: string) => `templates:${firmId}`,

  template: (id: string) => `template:${id}`,

  documentList: (firmId: string) => `documents:${firmId}`,

  document: (id: string) => `document:${id}`,

  aiPromptList: (firmId: string) => `ai-prompts:${firmId}`,

  exportOptions: () => 'export-options',
};

// Cache TTL configurations (in seconds)
export const cacheTTL = {
  list: 30,           // List endpoints: 30 seconds
  detail: 60,         // Detail endpoints: 1 minute
  static: 300,        // Static/rarely changing data: 5 minutes
  exportOptions: 3600, // Export options: 1 hour
};

export default cache;

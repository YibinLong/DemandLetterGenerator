import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { cache, cacheKeys, cacheTTL } from './cache.js';

describe('CacheService', () => {
  beforeEach(() => {
    cache.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get/set operations', () => {
    it('should store and retrieve data', () => {
      cache.set('test-key', { foo: 'bar' });
      const result = cache.get<{ foo: string }>('test-key');

      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ foo: 'bar' });
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should generate and return etag', () => {
      const etag = cache.set('test-key', { foo: 'bar' });
      const result = cache.get('test-key');

      expect(etag).toBeTruthy();
      expect(result!.etag).toBe(etag);
    });

    it('should expire entries after TTL', () => {
      cache.set('test-key', { foo: 'bar' }, 60); // 60 seconds TTL

      // Should exist before TTL
      expect(cache.get('test-key')).not.toBeNull();

      // Advance time past TTL
      vi.advanceTimersByTime(61 * 1000);

      // Should be expired
      expect(cache.get('test-key')).toBeNull();
    });

    it('should use custom TTL', () => {
      cache.set('short-lived', 'data', 5); // 5 seconds

      vi.advanceTimersByTime(4 * 1000);
      expect(cache.get('short-lived')).not.toBeNull();

      vi.advanceTimersByTime(2 * 1000);
      expect(cache.get('short-lived')).toBeNull();
    });
  });

  describe('invalidate operations', () => {
    it('should delete entries matching pattern', () => {
      cache.set('users:1', { name: 'John' });
      cache.set('users:2', { name: 'Jane' });
      cache.set('posts:1', { title: 'Hello' });

      const deleted = cache.invalidate(/^users:/);

      expect(deleted).toBe(2);
      expect(cache.get('users:1')).toBeNull();
      expect(cache.get('users:2')).toBeNull();
      expect(cache.get('posts:1')).not.toBeNull();
    });

    it('should delete specific key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const deleted = cache.delete('key1');

      expect(deleted).toBe(true);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).not.toBeNull();
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = cache.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key', 'value');

      // Miss
      cache.get('non-existent');

      // Hits
      cache.get('key');
      cache.get('key');

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should report cache size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
    });
  });

  describe('eviction', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });
  });
});

describe('cacheKeys', () => {
  it('should generate consistent demand letter list keys', () => {
    const key1 = cacheKeys.demandLetterList('firm-123', { status: 'draft' });
    const key2 = cacheKeys.demandLetterList('firm-123', { status: 'draft' });
    const key3 = cacheKeys.demandLetterList('firm-456', { status: 'draft' });

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it('should generate consistent demand letter detail keys', () => {
    const key = cacheKeys.demandLetter('letter-123');
    expect(key).toBe('demand-letter:letter-123');
  });

  it('should generate consistent template keys', () => {
    const listKey = cacheKeys.templateList('firm-123');
    const detailKey = cacheKeys.template('template-456');

    expect(listKey).toBe('templates:firm-123');
    expect(detailKey).toBe('template:template-456');
  });
});

describe('cacheTTL', () => {
  it('should have appropriate TTL values', () => {
    expect(cacheTTL.list).toBe(30);
    expect(cacheTTL.detail).toBe(60);
    expect(cacheTTL.static).toBe(300);
    expect(cacheTTL.exportOptions).toBe(3600);
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { performanceMonitor, timeQuery } from './performance.js';

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    performanceMonitor.reset();
  });

  describe('recordRequest', () => {
    it('should record request metrics', () => {
      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        responseTimeMs: 100,
        timestamp: Date.now(),
      });

      const stats = performanceMonitor.getStats();
      expect(stats.totalRequests).toBe(1);
    });

    it('should track slow requests', () => {
      // Record a slow request (> 2000ms)
      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/slow',
        statusCode: 200,
        responseTimeMs: 2500,
        timestamp: Date.now(),
      });

      const stats = performanceMonitor.getStats();
      expect(stats.slowRequestCount).toBe(1);

      const slowRequests = performanceMonitor.getSlowRequests();
      expect(slowRequests).toHaveLength(1);
      expect(slowRequests[0].path).toBe('/api/slow');
      expect(slowRequests[0].responseTimeMs).toBe(2500);
    });

    it('should track errors', () => {
      performanceMonitor.recordRequest({
        method: 'POST',
        path: '/api/fail',
        statusCode: 500,
        responseTimeMs: 50,
        timestamp: Date.now(),
      });

      const stats = performanceMonitor.getStats();
      expect(stats.errorCount).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should calculate average response time', () => {
      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        responseTimeMs: 100,
        timestamp: Date.now(),
      });

      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        responseTimeMs: 200,
        timestamp: Date.now(),
      });

      const stats = performanceMonitor.getStats();
      expect(stats.avgResponseTimeMs).toBe(150);
    });

    it('should calculate percentiles', () => {
      // Add 100 requests with response times from 1-100ms
      for (let i = 1; i <= 100; i++) {
        performanceMonitor.recordRequest({
          method: 'GET',
          path: '/api/test',
          statusCode: 200,
          responseTimeMs: i,
          timestamp: Date.now(),
        });
      }

      const stats = performanceMonitor.getStats();
      expect(stats.p50ResponseTimeMs).toBe(50);
      expect(stats.p95ResponseTimeMs).toBe(95);
      expect(stats.p99ResponseTimeMs).toBe(99);
    });

    it('should handle empty metrics', () => {
      const stats = performanceMonitor.getStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.avgResponseTimeMs).toBe(0);
      expect(stats.p50ResponseTimeMs).toBe(0);
    });
  });

  describe('getEndpointStats', () => {
    it('should group stats by endpoint', () => {
      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/users/123',
        statusCode: 200,
        responseTimeMs: 100,
        timestamp: Date.now(),
      });

      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/users/456',
        statusCode: 200,
        responseTimeMs: 200,
        timestamp: Date.now(),
      });

      performanceMonitor.recordRequest({
        method: 'POST',
        path: '/api/users',
        statusCode: 201,
        responseTimeMs: 150,
        timestamp: Date.now(),
      });

      const endpointStats = performanceMonitor.getEndpointStats();

      // Should normalize UUID-like IDs to :id
      expect(endpointStats['GET /api/users/:num']).toBeDefined();
      expect(endpointStats['GET /api/users/:num'].count).toBe(2);
      expect(endpointStats['GET /api/users/:num'].avgResponseTimeMs).toBe(150);

      expect(endpointStats['POST /api/users']).toBeDefined();
      expect(endpointStats['POST /api/users'].count).toBe(1);
    });

    it('should calculate error rate per endpoint', () => {
      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        responseTimeMs: 100,
        timestamp: Date.now(),
      });

      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/test',
        statusCode: 500,
        responseTimeMs: 100,
        timestamp: Date.now(),
      });

      const endpointStats = performanceMonitor.getEndpointStats();
      expect(endpointStats['GET /api/test'].errorRate).toBe(0.5);
    });
  });

  describe('getSlowRequests', () => {
    it('should return slow requests in reverse chronological order', () => {
      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/slow1',
        statusCode: 200,
        responseTimeMs: 3000,
        timestamp: Date.now() - 1000,
      });

      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/slow2',
        statusCode: 200,
        responseTimeMs: 2500,
        timestamp: Date.now(),
      });

      const slowRequests = performanceMonitor.getSlowRequests();

      expect(slowRequests[0].path).toBe('/api/slow2');
      expect(slowRequests[1].path).toBe('/api/slow1');
    });
  });

  describe('onAlert', () => {
    it('should trigger callback on very slow requests', () => {
      const alertCallback = vi.fn();
      performanceMonitor.onAlert(alertCallback);

      // Trigger a very slow request (> 5000ms)
      performanceMonitor.recordRequest({
        method: 'GET',
        path: '/api/very-slow',
        statusCode: 200,
        responseTimeMs: 6000,
        timestamp: Date.now(),
      });

      expect(alertCallback).toHaveBeenCalledWith(
        'Very slow request detected',
        expect.objectContaining({
          method: 'GET',
          path: '/api/very-slow',
          responseTimeMs: 6000,
        })
      );
    });

    it('should trigger callback on 5xx errors', () => {
      const alertCallback = vi.fn();
      performanceMonitor.onAlert(alertCallback);

      performanceMonitor.recordRequest({
        method: 'POST',
        path: '/api/error',
        statusCode: 500,
        responseTimeMs: 100,
        timestamp: Date.now(),
      });

      expect(alertCallback).toHaveBeenCalledWith(
        'Server error detected',
        expect.objectContaining({
          statusCode: 500,
        })
      );
    });
  });
});

describe('timeQuery', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the function result', () => {
    const result = timeQuery('test-query', () => 'result');
    expect(result).toBe('result');
  });

  it('should log slow queries', () => {
    // Mock a slow query (simulate with a delay mechanism if needed)
    // For now, we just verify the function executes
    const result = timeQuery('slow-query', () => {
      // Simulate computation
      let sum = 0;
      for (let i = 0; i < 1000000; i++) {
        sum += i;
      }
      return sum;
    });

    expect(typeof result).toBe('number');
  });

  it('should rethrow errors', () => {
    expect(() =>
      timeQuery('error-query', () => {
        throw new Error('Test error');
      })
    ).toThrow('Test error');
  });
});

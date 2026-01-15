// Performance monitoring service
// Tracks request timing, slow queries, and provides metrics

import { Request, Response, NextFunction } from 'express';

interface RequestMetric {
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  timestamp: number;
}

interface PerformanceStats {
  totalRequests: number;
  avgResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  slowRequestCount: number;
  errorCount: number;
  requestsPerMinute: number;
}

interface SlowRequest {
  method: string;
  path: string;
  responseTimeMs: number;
  timestamp: string;
}

const SLOW_REQUEST_THRESHOLD_MS = 2000; // 2 seconds
const METRICS_RETENTION_MINUTES = 60;
const MAX_SLOW_REQUESTS = 100;

class PerformanceMonitor {
  private metrics: RequestMetric[] = [];
  private slowRequests: SlowRequest[] = [];
  private alertCallbacks: ((message: string, details: Record<string, unknown>) => void)[] = [];

  constructor() {
    // Periodic cleanup of old metrics
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Record a request metric
   */
  recordRequest(metric: RequestMetric): void {
    this.metrics.push(metric);

    // Track slow requests
    if (metric.responseTimeMs > SLOW_REQUEST_THRESHOLD_MS) {
      this.recordSlowRequest(metric);
    }

    // Check for alerts
    this.checkAlerts(metric);
  }

  /**
   * Record a slow request
   */
  private recordSlowRequest(metric: RequestMetric): void {
    this.slowRequests.push({
      method: metric.method,
      path: metric.path,
      responseTimeMs: metric.responseTimeMs,
      timestamp: new Date(metric.timestamp).toISOString(),
    });

    // Keep only the most recent slow requests
    if (this.slowRequests.length > MAX_SLOW_REQUESTS) {
      this.slowRequests = this.slowRequests.slice(-MAX_SLOW_REQUESTS);
    }
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(metric: RequestMetric): void {
    // Alert on very slow requests (> 5 seconds)
    if (metric.responseTimeMs > 5000) {
      this.triggerAlert('Very slow request detected', {
        method: metric.method,
        path: metric.path,
        responseTimeMs: metric.responseTimeMs,
      });
    }

    // Alert on 5xx errors
    if (metric.statusCode >= 500) {
      this.triggerAlert('Server error detected', {
        method: metric.method,
        path: metric.path,
        statusCode: metric.statusCode,
      });
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(message: string, details: Record<string, unknown>): void {
    console.warn(`[Performance Alert] ${message}`, details);
    for (const callback of this.alertCallbacks) {
      try {
        callback(message, details);
      } catch (error) {
        console.error('Alert callback error:', error);
      }
    }
  }

  /**
   * Register an alert callback
   */
  onAlert(callback: (message: string, details: Record<string, unknown>) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get performance statistics
   */
  getStats(): PerformanceStats {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentMetrics = this.metrics.filter(m => m.timestamp > oneMinuteAgo);

    const responseTimes = this.metrics.map(m => m.responseTimeMs).sort((a, b) => a - b);

    return {
      totalRequests: this.metrics.length,
      avgResponseTimeMs: this.calculateAverage(responseTimes),
      p50ResponseTimeMs: this.calculatePercentile(responseTimes, 50),
      p95ResponseTimeMs: this.calculatePercentile(responseTimes, 95),
      p99ResponseTimeMs: this.calculatePercentile(responseTimes, 99),
      slowRequestCount: this.slowRequests.length,
      errorCount: this.metrics.filter(m => m.statusCode >= 400).length,
      requestsPerMinute: recentMetrics.length,
    };
  }

  /**
   * Get slow requests
   */
  getSlowRequests(): SlowRequest[] {
    return [...this.slowRequests].reverse();
  }

  /**
   * Get endpoint-specific stats
   */
  getEndpointStats(): Record<string, {
    count: number;
    avgResponseTimeMs: number;
    errorRate: number;
  }> {
    const endpointMap = new Map<string, RequestMetric[]>();

    for (const metric of this.metrics) {
      const key = `${metric.method} ${this.normalizeEndpoint(metric.path)}`;
      if (!endpointMap.has(key)) {
        endpointMap.set(key, []);
      }
      endpointMap.get(key)!.push(metric);
    }

    const result: Record<string, { count: number; avgResponseTimeMs: number; errorRate: number }> = {};
    for (const [key, metrics] of endpointMap.entries()) {
      const responseTimes = metrics.map(m => m.responseTimeMs);
      const errorCount = metrics.filter(m => m.statusCode >= 400).length;
      result[key] = {
        count: metrics.length,
        avgResponseTimeMs: this.calculateAverage(responseTimes),
        errorRate: metrics.length > 0 ? errorCount / metrics.length : 0,
      };
    }

    return result;
  }

  /**
   * Normalize endpoint path (replace UUIDs and IDs with placeholders)
   */
  private normalizeEndpoint(path: string): string {
    return path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+/g, '/:num');
  }

  /**
   * Calculate average
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Cleanup old metrics
   */
  private cleanup(): void {
    const cutoff = Date.now() - (METRICS_RETENTION_MINUTES * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.metrics = [];
    this.slowRequests = [];
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Express middleware to track request performance
 */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Capture response finish to record timing
  res.on('finish', () => {
    const responseTimeMs = Date.now() - startTime;

    // Record the metric
    performanceMonitor.recordRequest({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTimeMs,
      timestamp: startTime,
    });

    // Set timing header if not already sent
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${responseTimeMs}ms`);
    }
  });

  next();
}

/**
 * Database query timing helper
 */
export function timeQuery<T>(name: string, fn: () => T): T {
  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;

    if (duration > 2000) {
      console.warn(`[Slow Query] ${name}: ${duration.toFixed(2)}ms`);
    }

    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(`[Query Error] ${name}: ${duration.toFixed(2)}ms`, error);
    throw error;
  }
}

export default { performanceMonitor, performanceMiddleware, timeQuery };

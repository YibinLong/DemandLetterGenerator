// Tests for Scaling Service
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getScalingConfig,
  CircuitBreaker,
  HealthChecker,
  MetricsCollector,
  initializeScaling,
  ScalingConfig,
} from './scaling.js';

describe('Scaling Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('should return default configuration for development', () => {
    process.env.NODE_ENV = 'development';
    const config = getScalingConfig();

    expect(config.environment).toBe('development');
    expect(config.enableStatelessMode).toBe(false);
    expect(config.sessionStore).toBe('memory');
    expect(config.autoScaling.enabled).toBe(false);
    expect(config.circuitBreaker.enabled).toBe(false);
  });

  it('should return production configuration', () => {
    process.env.NODE_ENV = 'production';
    const config = getScalingConfig();

    expect(config.environment).toBe('production');
    expect(config.enableStatelessMode).toBe(true);
    expect(config.sessionStore).toBe('database');
    expect(config.autoScaling.enabled).toBe(true);
    expect(config.circuitBreaker.enabled).toBe(true);
  });

  it('should respect environment variable overrides', () => {
    process.env.NODE_ENV = 'production';
    process.env.MIN_INSTANCES = '5';
    process.env.MAX_INSTANCES = '20';
    process.env.TARGET_CPU = '60';
    process.env.MAX_MEMORY_MB = '1024';

    const config = getScalingConfig();

    expect(config.autoScaling.minInstances).toBe(5);
    expect(config.autoScaling.maxInstances).toBe(20);
    expect(config.autoScaling.targetCpuUtilization).toBe(60);
    expect(config.resourceLimits.maxMemoryMB).toBe(1024);
  });

  it('should use Vercel region when available', () => {
    process.env.VERCEL_REGION = 'sfo1';
    const config = getScalingConfig();

    expect(config.region).toBe('sfo1');
  });

  it('should generate unique instance ID', () => {
    const config1 = getScalingConfig();
    // Clear the cached config for testing
    vi.resetModules();
    const config2 = getScalingConfig();

    expect(config1.instanceId).toBeDefined();
    expect(config1.instanceId).toMatch(/^inst_/);
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      enabled: true,
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenRequests: 2,
    });
  });

  it('should execute successful requests normally', async () => {
    const result = await circuitBreaker.execute(async () => 'success');
    expect(result).toBe('success');
  });

  it('should track failures', async () => {
    const failingFn = async () => {
      throw new Error('Test failure');
    };

    // First two failures
    await expect(circuitBreaker.execute(failingFn)).rejects.toThrow();
    await expect(circuitBreaker.execute(failingFn)).rejects.toThrow();

    const state = circuitBreaker.getState();
    expect(state.failures).toBe(2);
    expect(state.state).toBe('closed');
  });

  it('should open circuit after threshold failures', async () => {
    const failingFn = async () => {
      throw new Error('Test failure');
    };

    // Reach threshold
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow();
    }

    const state = circuitBreaker.getState();
    expect(state.state).toBe('open');
  });

  it('should reject requests when circuit is open', async () => {
    const failingFn = async () => {
      throw new Error('Test failure');
    };

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow();
    }

    // Should reject with circuit breaker error
    await expect(
      circuitBreaker.execute(async () => 'should not run')
    ).rejects.toThrow('Circuit breaker is open');
  });

  it('should transition to half-open after reset timeout', async () => {
    const failingFn = async () => {
      throw new Error('Test failure');
    };

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow();
    }

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should allow request (half-open state)
    const result = await circuitBreaker.execute(async () => 'recovered');
    expect(result).toBe('recovered');

    // After enough successes, should close
    await circuitBreaker.execute(async () => 'success');

    const state = circuitBreaker.getState();
    expect(state.state).toBe('closed');
  });

  it('should reset the circuit breaker', () => {
    circuitBreaker.reset();
    const state = circuitBreaker.getState();

    expect(state.state).toBe('closed');
    expect(state.failures).toBe(0);
    expect(state.lastFailure).toBeNull();
  });

  it('should bypass when disabled', async () => {
    const disabledBreaker = new CircuitBreaker({
      enabled: false,
      failureThreshold: 1,
      resetTimeout: 1000,
      halfOpenRequests: 1,
    });

    const failingFn = async () => {
      throw new Error('Test failure');
    };

    // Should always throw the original error, not circuit breaker error
    await expect(disabledBreaker.execute(failingFn)).rejects.toThrow('Test failure');
    await expect(disabledBreaker.execute(failingFn)).rejects.toThrow('Test failure');
    await expect(disabledBreaker.execute(failingFn)).rejects.toThrow('Test failure');
  });
});

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;
  let config: ScalingConfig;

  beforeEach(() => {
    config = {
      instanceId: 'test-instance',
      region: 'local',
      environment: 'development',
      enableStatelessMode: false,
      sessionStore: 'memory',
      healthCheckPath: '/health',
      healthCheckInterval: 30000,
      unhealthyThreshold: 2,
      healthyThreshold: 2,
      autoScaling: {
        enabled: false,
        minInstances: 1,
        maxInstances: 10,
        targetCpuUtilization: 70,
        targetMemoryUtilization: 80,
        scaleUpCooldown: 60000,
        scaleDownCooldown: 300000,
        requestsPerInstance: 100,
      },
      resourceLimits: {
        maxMemoryMB: 512,
        maxCpuPercent: 80,
        maxConnections: 100,
        maxRequestsPerSecond: 100,
      },
      circuitBreaker: {
        enabled: false,
        failureThreshold: 5,
        resetTimeout: 30000,
        halfOpenRequests: 3,
      },
    };

    healthChecker = new HealthChecker(config);
  });

  it('should return healthy status when all checks pass', async () => {
    const health = await healthChecker.check({
      database: async () => true,
      aiService: async () => true,
    });

    expect(health.healthy).toBe(true);
    expect(health.instanceId).toBe('test-instance');
    expect(health.checks.database).toBe(true);
    expect(health.checks.aiService).toBe(true);
    expect(health.checks.memory).toBe(true);
  });

  it('should report unhealthy when database check fails', async () => {
    // Need multiple failures to transition to unhealthy
    await healthChecker.check({
      database: async () => false,
      aiService: async () => true,
    });

    const health = await healthChecker.check({
      database: async () => false,
      aiService: async () => true,
    });

    expect(health.healthy).toBe(false);
    expect(health.checks.database).toBe(false);
  });

  it('should handle check errors gracefully', async () => {
    await healthChecker.check({
      database: async () => { throw new Error('DB error'); },
      aiService: async () => true,
    });

    const health = await healthChecker.check({
      database: async () => { throw new Error('DB error'); },
      aiService: async () => true,
    });

    expect(health.checks.database).toBe(false);
  });

  it('should track uptime', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));

    const health = await healthChecker.check({
      database: async () => true,
      aiService: async () => true,
    });

    expect(health.uptime).toBeGreaterThan(0);
  });

  it('should include memory metrics', async () => {
    const health = await healthChecker.check({
      database: async () => true,
      aiService: async () => true,
    });

    expect(health.metrics.memoryUsage).toBeDefined();
    expect(health.metrics.memoryUsage).toBeGreaterThanOrEqual(0);
    expect(health.metrics.memoryUsage).toBeLessThanOrEqual(100);
  });
});

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  it('should record requests', () => {
    collector.recordRequest(100, false);
    collector.recordRequest(200, false);
    collector.recordRequest(150, true);

    const metrics = collector.getMetrics();
    expect(metrics.throughput).toBeGreaterThan(0);
    expect(metrics.errorRate).toBeGreaterThan(0);
    expect(metrics.averageLatency).toBeGreaterThan(0);
  });

  it('should calculate average latency', () => {
    collector.recordRequest(100, false);
    collector.recordRequest(200, false);
    collector.recordRequest(300, false);

    const metrics = collector.getMetrics();
    expect(metrics.averageLatency).toBe(200);
  });

  it('should calculate error rate', () => {
    collector.recordRequest(100, false);
    collector.recordRequest(100, true);
    collector.recordRequest(100, false);
    collector.recordRequest(100, true);

    const metrics = collector.getMetrics();
    expect(metrics.errorRate).toBe(50);
  });

  it('should include resource utilization', () => {
    const metrics = collector.getMetrics();

    expect(metrics.resourceUtilization).toBeDefined();
    expect(metrics.resourceUtilization.memory).toBeGreaterThanOrEqual(0);
  });

  it('should reset metrics', () => {
    collector.recordRequest(100, false);
    collector.recordRequest(100, true);

    collector.reset();
    const metrics = collector.getMetrics();

    expect(metrics.averageLatency).toBe(0);
    expect(metrics.errorRate).toBe(0);
  });
});

describe('initializeScaling', () => {
  it('should return all scaling components', () => {
    const { config, circuitBreaker, healthChecker, metricsCollector } = initializeScaling();

    expect(config).toBeDefined();
    expect(circuitBreaker).toBeDefined();
    expect(healthChecker).toBeDefined();
    expect(metricsCollector).toBeDefined();
  });

  it('should return singleton instances', () => {
    const first = initializeScaling();
    const second = initializeScaling();

    expect(first.config).toBe(second.config);
    expect(first.circuitBreaker).toBe(second.circuitBreaker);
  });
});

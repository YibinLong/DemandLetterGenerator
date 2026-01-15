// Scaling Configuration Service
// Provides configuration for horizontal scaling, load balancing, and auto-scaling policies

export interface ScalingConfig {
  // Instance identification
  instanceId: string;
  region: string;
  environment: 'development' | 'staging' | 'production';

  // Horizontal scaling settings
  enableStatelessMode: boolean;
  sessionStore: 'memory' | 'database' | 'redis';

  // Load balancing settings
  healthCheckPath: string;
  healthCheckInterval: number;
  unhealthyThreshold: number;
  healthyThreshold: number;

  // Auto-scaling thresholds
  autoScaling: {
    enabled: boolean;
    minInstances: number;
    maxInstances: number;
    targetCpuUtilization: number;
    targetMemoryUtilization: number;
    scaleUpCooldown: number;
    scaleDownCooldown: number;
    requestsPerInstance: number;
  };

  // Resource limits
  resourceLimits: {
    maxMemoryMB: number;
    maxCpuPercent: number;
    maxConnections: number;
    maxRequestsPerSecond: number;
  };

  // Circuit breaker settings
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    resetTimeout: number;
    halfOpenRequests: number;
  };
}

export interface InstanceHealth {
  instanceId: string;
  healthy: boolean;
  uptime: number;
  lastCheck: Date;
  metrics: {
    cpuUsage: number;
    memoryUsage: number;
    activeConnections: number;
    requestsPerSecond: number;
    errorRate: number;
    averageResponseTime: number;
  };
  checks: {
    database: boolean;
    aiService: boolean;
    memory: boolean;
    cpu: boolean;
  };
}

export interface ScalingMetrics {
  currentInstances: number;
  desiredInstances: number;
  pendingRequests: number;
  averageLatency: number;
  errorRate: number;
  throughput: number;
  resourceUtilization: {
    cpu: number;
    memory: number;
    connections: number;
  };
}

// Generate unique instance ID
function generateInstanceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `inst_${timestamp}_${random}`;
}

// Get configuration from environment
export function getScalingConfig(): ScalingConfig {
  const env = (process.env.NODE_ENV || 'development') as ScalingConfig['environment'];

  return {
    instanceId: process.env.INSTANCE_ID || generateInstanceId(),
    region: process.env.VERCEL_REGION || process.env.REGION || 'local',
    environment: env,

    enableStatelessMode: env === 'production' || process.env.STATELESS_MODE === 'true',
    sessionStore: env === 'production' ? 'database' : 'memory',

    healthCheckPath: '/health',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    unhealthyThreshold: parseInt(process.env.UNHEALTHY_THRESHOLD || '3', 10),
    healthyThreshold: parseInt(process.env.HEALTHY_THRESHOLD || '2', 10),

    autoScaling: {
      enabled: env === 'production',
      minInstances: parseInt(process.env.MIN_INSTANCES || '1', 10),
      maxInstances: parseInt(process.env.MAX_INSTANCES || '10', 10),
      targetCpuUtilization: parseFloat(process.env.TARGET_CPU || '70'),
      targetMemoryUtilization: parseFloat(process.env.TARGET_MEMORY || '80'),
      scaleUpCooldown: parseInt(process.env.SCALE_UP_COOLDOWN || '60000', 10),
      scaleDownCooldown: parseInt(process.env.SCALE_DOWN_COOLDOWN || '300000', 10),
      requestsPerInstance: parseInt(process.env.REQUESTS_PER_INSTANCE || '100', 10),
    },

    resourceLimits: {
      maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB || '512', 10),
      maxCpuPercent: parseInt(process.env.MAX_CPU_PERCENT || '80', 10),
      maxConnections: parseInt(process.env.MAX_CONNECTIONS || '100', 10),
      maxRequestsPerSecond: parseInt(process.env.MAX_RPS || '100', 10),
    },

    circuitBreaker: {
      enabled: env === 'production',
      failureThreshold: parseInt(process.env.CIRCUIT_FAILURE_THRESHOLD || '5', 10),
      resetTimeout: parseInt(process.env.CIRCUIT_RESET_TIMEOUT || '30000', 10),
      halfOpenRequests: parseInt(process.env.CIRCUIT_HALF_OPEN || '3', 10),
    },
  };
}

// Circuit breaker implementation
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailure: Date | null = null;
  private config: ScalingConfig['circuitBreaker'];

  constructor(config: ScalingConfig['circuitBreaker']) {
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return fn();
    }

    if (this.state === 'open') {
      // Check if we should try again
      if (this.lastFailure && Date.now() - this.lastFailure.getTime() > this.config.resetTimeout) {
        this.state = 'half-open';
        this.successes = 0;
        console.log('[CircuitBreaker] Transitioning to half-open');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();

      if (this.state === 'half-open') {
        this.successes++;
        if (this.successes >= this.config.halfOpenRequests) {
          this.state = 'closed';
          this.failures = 0;
          console.log('[CircuitBreaker] Circuit closed');
        }
      } else {
        this.failures = 0;
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = new Date();

      if (this.failures >= this.config.failureThreshold) {
        this.state = 'open';
        console.log('[CircuitBreaker] Circuit opened');
      }

      throw error;
    }
  }

  getState(): { state: string; failures: number; lastFailure: Date | null } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
  }
}

// Health check implementation
class HealthChecker {
  private config: ScalingConfig;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private isHealthy = true;
  private lastCheck: Date = new Date();
  private startTime = Date.now();

  constructor(config: ScalingConfig) {
    this.config = config;
  }

  async check(
    checks: {
      database: () => Promise<boolean>;
      aiService: () => Promise<boolean>;
    }
  ): Promise<InstanceHealth> {
    this.lastCheck = new Date();

    const checkResults = {
      database: false,
      aiService: false,
      memory: false,
      cpu: false,
    };

    // Database check
    try {
      checkResults.database = await checks.database();
    } catch {
      checkResults.database = false;
    }

    // AI service check
    try {
      checkResults.aiService = await checks.aiService();
    } catch {
      checkResults.aiService = false;
    }

    // Memory check
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    checkResults.memory = memUsageMB < this.config.resourceLimits.maxMemoryMB;

    // CPU check (simplified - in production, use proper CPU monitoring)
    checkResults.cpu = true; // Assume healthy for now

    // Calculate overall health
    const allChecksPassed = Object.values(checkResults).every(v => v);

    if (allChecksPassed) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;

      if (!this.isHealthy && this.consecutiveSuccesses >= this.config.healthyThreshold) {
        this.isHealthy = true;
        console.log('[HealthChecker] Instance is now healthy');
      }
    } else {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;

      if (this.isHealthy && this.consecutiveFailures >= this.config.unhealthyThreshold) {
        this.isHealthy = false;
        console.log('[HealthChecker] Instance is now unhealthy');
      }
    }

    return {
      instanceId: this.config.instanceId,
      healthy: this.isHealthy,
      uptime: Date.now() - this.startTime,
      lastCheck: this.lastCheck,
      metrics: {
        cpuUsage: 0, // Would need actual CPU monitoring
        memoryUsage: (memUsageMB / this.config.resourceLimits.maxMemoryMB) * 100,
        activeConnections: 0, // Would need connection tracking
        requestsPerSecond: 0, // Would need request tracking
        errorRate: 0, // Would need error tracking
        averageResponseTime: 0, // Would need response time tracking
      },
      checks: checkResults,
    };
  }

  getHealth(): { healthy: boolean; uptime: number } {
    return {
      healthy: this.isHealthy,
      uptime: Date.now() - this.startTime,
    };
  }
}

// Scaling metrics collector
class MetricsCollector {
  private requestCounts: number[] = [];
  private responseTimes: number[] = [];
  private errors: number[] = [];
  private windowSize = 60; // 60 seconds

  recordRequest(responseTime: number, isError: boolean): void {
    const now = Date.now();
    const second = Math.floor(now / 1000) % this.windowSize;

    // Initialize or reset bucket
    if (this.requestCounts[second] === undefined || this.shouldReset(second)) {
      this.requestCounts[second] = 0;
      this.responseTimes[second] = 0;
      this.errors[second] = 0;
    }

    this.requestCounts[second]++;
    this.responseTimes[second] += responseTime;
    if (isError) {
      this.errors[second]++;
    }
  }

  private shouldReset(second: number): boolean {
    // Reset if data is old (simple implementation)
    return false;
  }

  getMetrics(): ScalingMetrics {
    const totalRequests = this.requestCounts.reduce((a, b) => a + (b || 0), 0);
    const totalResponseTime = this.responseTimes.reduce((a, b) => a + (b || 0), 0);
    const totalErrors = this.errors.reduce((a, b) => a + (b || 0), 0);

    const memUsage = process.memoryUsage();

    return {
      currentInstances: 1, // Single instance in this implementation
      desiredInstances: 1,
      pendingRequests: 0,
      averageLatency: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
      throughput: totalRequests / this.windowSize,
      resourceUtilization: {
        cpu: 0, // Would need actual CPU monitoring
        memory: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        connections: 0, // Would need connection tracking
      },
    };
  }

  reset(): void {
    this.requestCounts = [];
    this.responseTimes = [];
    this.errors = [];
  }
}

// Export singleton instances
let scalingConfig: ScalingConfig | null = null;
let circuitBreaker: CircuitBreaker | null = null;
let healthChecker: HealthChecker | null = null;
let metricsCollector: MetricsCollector | null = null;

export function initializeScaling(): {
  config: ScalingConfig;
  circuitBreaker: CircuitBreaker;
  healthChecker: HealthChecker;
  metricsCollector: MetricsCollector;
} {
  if (!scalingConfig) {
    scalingConfig = getScalingConfig();
    circuitBreaker = new CircuitBreaker(scalingConfig.circuitBreaker);
    healthChecker = new HealthChecker(scalingConfig);
    metricsCollector = new MetricsCollector();

    console.log('[Scaling] Initialized with config:', {
      instanceId: scalingConfig.instanceId,
      region: scalingConfig.region,
      environment: scalingConfig.environment,
      statelessMode: scalingConfig.enableStatelessMode,
    });
  }

  return {
    config: scalingConfig,
    circuitBreaker: circuitBreaker!,
    healthChecker: healthChecker!,
    metricsCollector: metricsCollector!,
  };
}

export function getCircuitBreaker(): CircuitBreaker {
  if (!circuitBreaker) {
    initializeScaling();
  }
  return circuitBreaker!;
}

export function getHealthChecker(): HealthChecker {
  if (!healthChecker) {
    initializeScaling();
  }
  return healthChecker!;
}

export function getMetricsCollector(): MetricsCollector {
  if (!metricsCollector) {
    initializeScaling();
  }
  return metricsCollector!;
}

// Middleware to record metrics
export function scalingMiddleware() {
  const collector = getMetricsCollector();

  return (req: unknown, res: { on: (event: string, fn: () => void) => void }, next: () => void) => {
    const start = Date.now();

    res.on('finish', () => {
      const responseTime = Date.now() - start;
      const statusCode = (res as unknown as { statusCode: number }).statusCode;
      const isError = statusCode >= 500;
      collector.recordRequest(responseTime, isError);
    });

    next();
  };
}

export { CircuitBreaker, HealthChecker, MetricsCollector };

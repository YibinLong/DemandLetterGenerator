// Load Testing Script for Demand Letter Generator
// Tests the scalability of the backend API under various load conditions

import { performance } from 'perf_hooks';

interface LoadTestConfig {
  baseUrl: string;
  endpoints: EndpointConfig[];
  duration: number; // Duration in seconds
  concurrentUsers: number;
  rampUpTime: number; // Time to reach full concurrency in seconds
  thinkTime: number; // Delay between requests in ms
}

interface EndpointConfig {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  weight: number; // Relative frequency of this endpoint
}

interface RequestResult {
  endpoint: string;
  statusCode: number;
  responseTime: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

interface LoadTestResults {
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    medianResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
    duration: number;
  };
  byEndpoint: Record<string, {
    requests: number;
    successes: number;
    failures: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    errorRate: number;
  }>;
  timeline: {
    timestamp: Date;
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
  }[];
  errors: {
    endpoint: string;
    statusCode: number;
    message: string;
    count: number;
  }[];
}

class LoadTester {
  private config: LoadTestConfig;
  private results: RequestResult[] = [];
  private isRunning = false;
  private startTime = 0;
  private activeUsers = 0;
  private authToken: string | null = null;

  constructor(config: LoadTestConfig) {
    this.config = config;
  }

  async authenticate(email: string, password: string): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json() as { token: string };
        this.authToken = data.token;
        console.log('[LoadTest] Authentication successful');
      } else {
        console.log('[LoadTest] Authentication failed, continuing without auth');
      }
    } catch (error) {
      console.log('[LoadTest] Authentication error, continuing without auth');
    }
  }

  async run(): Promise<LoadTestResults> {
    console.log('[LoadTest] Starting load test...');
    console.log(`[LoadTest] Config: ${this.config.concurrentUsers} users, ${this.config.duration}s duration`);

    this.isRunning = true;
    this.startTime = Date.now();
    this.results = [];

    // Spawn virtual users with ramp-up
    const userPromises: Promise<void>[] = [];
    const userDelay = (this.config.rampUpTime * 1000) / this.config.concurrentUsers;

    for (let i = 0; i < this.config.concurrentUsers; i++) {
      await this.delay(userDelay);
      userPromises.push(this.runVirtualUser(i));
    }

    // Wait for test duration
    const remainingTime = (this.config.duration * 1000) - (Date.now() - this.startTime);
    if (remainingTime > 0) {
      await this.delay(remainingTime);
    }

    // Stop test
    this.isRunning = false;
    console.log('[LoadTest] Stopping test...');

    // Wait for all users to complete their current request
    await Promise.all(userPromises);

    return this.calculateResults();
  }

  private async runVirtualUser(userId: number): Promise<void> {
    this.activeUsers++;
    console.log(`[LoadTest] User ${userId} started (active: ${this.activeUsers})`);

    while (this.isRunning) {
      const endpoint = this.selectEndpoint();
      await this.makeRequest(endpoint);
      await this.delay(this.config.thinkTime);
    }

    this.activeUsers--;
    console.log(`[LoadTest] User ${userId} finished (active: ${this.activeUsers})`);
  }

  private selectEndpoint(): EndpointConfig {
    // Weighted random selection
    const totalWeight = this.config.endpoints.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;

    for (const endpoint of this.config.endpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }

    return this.config.endpoints[0];
  }

  private async makeRequest(endpoint: EndpointConfig): Promise<void> {
    const start = performance.now();
    let statusCode = 0;
    let success = false;
    let error: string | undefined;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...endpoint.headers,
      };

      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await fetch(`${this.config.baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers,
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      });

      statusCode = response.status;
      success = statusCode >= 200 && statusCode < 400;

      if (!success) {
        const text = await response.text();
        error = text.substring(0, 100);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
      success = false;
    }

    const responseTime = performance.now() - start;

    this.results.push({
      endpoint: endpoint.name,
      statusCode,
      responseTime,
      success,
      error,
      timestamp: new Date(),
    });
  }

  private calculateResults(): LoadTestResults {
    const duration = (Date.now() - this.startTime) / 1000;
    const totalRequests = this.results.length;
    const successfulRequests = this.results.filter(r => r.success).length;
    const failedRequests = totalRequests - successfulRequests;

    // Calculate response times
    const responseTimes = this.results.map(r => r.responseTime).sort((a, b) => a - b);
    const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0;
    const medianResponseTime = this.percentile(responseTimes, 50);
    const p95ResponseTime = this.percentile(responseTimes, 95);
    const p99ResponseTime = this.percentile(responseTimes, 99);
    const minResponseTime = responseTimes[0] || 0;
    const maxResponseTime = responseTimes[responseTimes.length - 1] || 0;

    // Calculate by endpoint
    const byEndpoint: LoadTestResults['byEndpoint'] = {};
    const endpointNames = [...new Set(this.results.map(r => r.endpoint))];

    for (const name of endpointNames) {
      const endpointResults = this.results.filter(r => r.endpoint === name);
      const endpointTimes = endpointResults.map(r => r.responseTime).sort((a, b) => a - b);
      const endpointSuccesses = endpointResults.filter(r => r.success).length;

      byEndpoint[name] = {
        requests: endpointResults.length,
        successes: endpointSuccesses,
        failures: endpointResults.length - endpointSuccesses,
        averageResponseTime: endpointTimes.reduce((a, b) => a + b, 0) / endpointTimes.length || 0,
        p95ResponseTime: this.percentile(endpointTimes, 95),
        errorRate: ((endpointResults.length - endpointSuccesses) / endpointResults.length) * 100,
      };
    }

    // Calculate timeline (1-second buckets)
    const timeline: LoadTestResults['timeline'] = [];
    const bucketSize = 1000; // 1 second
    const buckets = new Map<number, RequestResult[]>();

    for (const result of this.results) {
      const bucket = Math.floor(result.timestamp.getTime() / bucketSize) * bucketSize;
      if (!buckets.has(bucket)) {
        buckets.set(bucket, []);
      }
      buckets.get(bucket)!.push(result);
    }

    for (const [timestamp, results] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
      const times = results.map(r => r.responseTime);
      const errors = results.filter(r => !r.success).length;

      timeline.push({
        timestamp: new Date(timestamp),
        requestsPerSecond: results.length,
        averageResponseTime: times.reduce((a, b) => a + b, 0) / times.length || 0,
        errorRate: (errors / results.length) * 100,
      });
    }

    // Aggregate errors
    const errorMap = new Map<string, { endpoint: string; statusCode: number; message: string; count: number }>();
    for (const result of this.results.filter(r => !r.success)) {
      const key = `${result.endpoint}:${result.statusCode}:${result.error}`;
      if (errorMap.has(key)) {
        errorMap.get(key)!.count++;
      } else {
        errorMap.set(key, {
          endpoint: result.endpoint,
          statusCode: result.statusCode,
          message: result.error || 'Unknown error',
          count: 1,
        });
      }
    }

    return {
      summary: {
        totalRequests,
        successfulRequests,
        failedRequests,
        averageResponseTime,
        medianResponseTime,
        p95ResponseTime,
        p99ResponseTime,
        minResponseTime,
        maxResponseTime,
        requestsPerSecond: totalRequests / duration,
        errorRate: (failedRequests / totalRequests) * 100,
        duration,
      },
      byEndpoint,
      timeline,
      errors: Array.from(errorMap.values()).sort((a, b) => b.count - a.count),
    };
  }

  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default test configuration
export function getDefaultLoadTestConfig(baseUrl: string = 'http://localhost:3001'): LoadTestConfig {
  return {
    baseUrl,
    endpoints: [
      {
        name: 'Health Check',
        method: 'GET',
        path: '/health',
        weight: 5,
      },
      {
        name: 'API Root',
        method: 'GET',
        path: '/api',
        weight: 3,
      },
      {
        name: 'Metrics',
        method: 'GET',
        path: '/metrics',
        weight: 2,
      },
    ],
    duration: 30, // 30 seconds
    concurrentUsers: 10,
    rampUpTime: 5, // 5 second ramp-up
    thinkTime: 100, // 100ms between requests
  };
}

// Authenticated test configuration (requires valid user credentials)
export function getAuthenticatedLoadTestConfig(
  baseUrl: string = 'http://localhost:3001'
): LoadTestConfig {
  return {
    baseUrl,
    endpoints: [
      {
        name: 'Health Check',
        method: 'GET',
        path: '/health',
        weight: 2,
      },
      {
        name: 'List Documents',
        method: 'GET',
        path: '/api/documents',
        weight: 5,
      },
      {
        name: 'List Templates',
        method: 'GET',
        path: '/api/templates',
        weight: 5,
      },
      {
        name: 'List Demand Letters',
        method: 'GET',
        path: '/api/demand-letters',
        weight: 8,
      },
    ],
    duration: 60, // 60 seconds
    concurrentUsers: 20,
    rampUpTime: 10, // 10 second ramp-up
    thinkTime: 200, // 200ms between requests
  };
}

// Print results to console
export function printResults(results: LoadTestResults): void {
  console.log('\n' + '='.repeat(60));
  console.log('LOAD TEST RESULTS');
  console.log('='.repeat(60));

  console.log('\n--- SUMMARY ---');
  console.log(`Duration: ${results.summary.duration.toFixed(2)}s`);
  console.log(`Total Requests: ${results.summary.totalRequests}`);
  console.log(`Successful: ${results.summary.successfulRequests}`);
  console.log(`Failed: ${results.summary.failedRequests}`);
  console.log(`Error Rate: ${results.summary.errorRate.toFixed(2)}%`);
  console.log(`Requests/sec: ${results.summary.requestsPerSecond.toFixed(2)}`);

  console.log('\n--- RESPONSE TIMES (ms) ---');
  console.log(`Average: ${results.summary.averageResponseTime.toFixed(2)}`);
  console.log(`Median: ${results.summary.medianResponseTime.toFixed(2)}`);
  console.log(`P95: ${results.summary.p95ResponseTime.toFixed(2)}`);
  console.log(`P99: ${results.summary.p99ResponseTime.toFixed(2)}`);
  console.log(`Min: ${results.summary.minResponseTime.toFixed(2)}`);
  console.log(`Max: ${results.summary.maxResponseTime.toFixed(2)}`);

  console.log('\n--- BY ENDPOINT ---');
  for (const [name, stats] of Object.entries(results.byEndpoint)) {
    console.log(`\n${name}:`);
    console.log(`  Requests: ${stats.requests}`);
    console.log(`  Success Rate: ${((stats.successes / stats.requests) * 100).toFixed(2)}%`);
    console.log(`  Avg Response: ${stats.averageResponseTime.toFixed(2)}ms`);
    console.log(`  P95 Response: ${stats.p95ResponseTime.toFixed(2)}ms`);
  }

  if (results.errors.length > 0) {
    console.log('\n--- TOP ERRORS ---');
    for (const error of results.errors.slice(0, 5)) {
      console.log(`${error.endpoint} (${error.statusCode}): ${error.message} [${error.count}x]`);
    }
  }

  console.log('\n' + '='.repeat(60));

  // Performance assertions
  const passed: string[] = [];
  const failed: string[] = [];

  if (results.summary.errorRate < 5) {
    passed.push('Error rate < 5%');
  } else {
    failed.push(`Error rate ${results.summary.errorRate.toFixed(2)}% >= 5%`);
  }

  if (results.summary.p95ResponseTime < 2000) {
    passed.push('P95 response time < 2s');
  } else {
    failed.push(`P95 response time ${results.summary.p95ResponseTime.toFixed(0)}ms >= 2000ms`);
  }

  if (results.summary.averageResponseTime < 500) {
    passed.push('Average response time < 500ms');
  } else {
    failed.push(`Average response time ${results.summary.averageResponseTime.toFixed(0)}ms >= 500ms`);
  }

  console.log('\n--- PERFORMANCE CHECKS ---');
  for (const p of passed) {
    console.log(`✅ ${p}`);
  }
  for (const f of failed) {
    console.log(`❌ ${f}`);
  }

  console.log('\n' + '='.repeat(60));
}

// Run as standalone script
async function main(): Promise<void> {
  const baseUrl = process.argv[2] || 'http://localhost:3001';
  const testType = process.argv[3] || 'basic';

  console.log(`Running ${testType} load test against ${baseUrl}`);

  let config: LoadTestConfig;

  if (testType === 'authenticated') {
    config = getAuthenticatedLoadTestConfig(baseUrl);
  } else {
    config = getDefaultLoadTestConfig(baseUrl);
  }

  const tester = new LoadTester(config);

  // Optionally authenticate
  if (testType === 'authenticated') {
    const email = process.env.TEST_USER_EMAIL || 'john.doe@demo.law';
    const password = process.env.TEST_USER_PASSWORD || 'password123';
    await tester.authenticate(email, password);
  }

  const results = await tester.run();
  printResults(results);

  // Exit with error if tests failed
  if (results.summary.errorRate >= 5 || results.summary.p95ResponseTime >= 2000) {
    process.exit(1);
  }
}

// Only run if executed directly
if (import.meta.url.startsWith('file:')) {
  const modulePath = new URL(import.meta.url).pathname;
  const isMainModule = process.argv[1] && (
    process.argv[1] === modulePath ||
    process.argv[1].endsWith('load-test.ts') ||
    process.argv[1].endsWith('load-test.js')
  );

  if (isMainModule) {
    main().catch(console.error);
  }
}

export { LoadTester, LoadTestConfig, EndpointConfig, LoadTestResults };
export default LoadTester;

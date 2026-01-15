import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase, getDatabase } from './db/index.js';
import { getDatabasePool } from './db/pool.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import demandLetterRoutes from './routes/demand-letters.js';
import templateRoutes from './routes/templates.js';
import collaborationRoutes from './routes/collaboration.js';
import changeTrackingRoutes from './routes/change-tracking.js';
import aiPromptsRoutes from './routes/ai-prompts.js';
import { generalRateLimit, startRateLimitCleanup } from './middleware/rateLimit.js';
import { initializeCollaboration } from './services/collaboration.js';
import { performanceMiddleware, performanceMonitor } from './services/performance.js';
import { cache } from './services/cache.js';
import { initializeScaling, getMetricsCollector, scalingMiddleware } from './services/scaling.js';
import { getRequestQueue } from './services/requestQueue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Initialize database
initializeDatabase();

// Initialize database pool for optimized connection management
const dbPool = getDatabasePool();
console.log('[Database] Connection pool initialized');

// Initialize scaling infrastructure
const scaling = initializeScaling();
console.log('[Scaling] Infrastructure initialized');

// Initialize request queue for AI operations
const requestQueue = getRequestQueue();
console.log('[RequestQueue] Request queue initialized');

// Start rate limit cleanup task
startRateLimitCleanup();

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Trust proxy for proper IP detection behind reverse proxies (Vercel, etc.)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // HSTS for HTTPS enforcement
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Prevent MIME type sniffing
  noSniff: true,
  // XSS protection
  xssFilter: true,
  // Referrer policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
}));

// Response compression (gzip/brotli)
app.use(compression({
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress streaming responses or already compressed content
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Performance monitoring middleware
app.use(performanceMiddleware);

// Scaling metrics middleware
app.use(scalingMiddleware());

// Apply general rate limiting to all API routes
app.use('/api', generalRateLimit);

// Health check endpoint (no rate limiting)
app.get('/health', (req: Request, res: Response) => {
  const dbHealth = dbPool.healthCheck();
  const dbStats = dbPool.getStats();
  const queueStats = requestQueue.getStats();

  res.json({
    status: dbHealth.healthy ? 'healthy' : 'degraded',
    service: 'backend-api',
    database: {
      status: dbHealth.healthy ? 'connected' : 'error',
      latency: dbHealth.latency,
      walEnabled: dbStats.walEnabled,
      queryCount: dbStats.totalQueries,
      slowQueries: dbStats.slowQueries,
    },
    queue: {
      pending: queueStats.pendingCount,
      processing: queueStats.processingCount,
      utilization: queueStats.queueUtilization,
    },
    scaling: {
      instanceId: scaling.config.instanceId,
      region: scaling.config.region,
      environment: scaling.config.environment,
      statelessMode: scaling.config.enableStatelessMode,
    },
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Performance metrics endpoint (no rate limiting, for monitoring)
app.get('/metrics', (req: Request, res: Response) => {
  const performanceStats = performanceMonitor.getStats();
  const cacheStats = cache.getStats();
  const dbStats = dbPool.getStats();
  const queueStats = requestQueue.getStats();
  const scalingMetrics = getMetricsCollector().getMetrics();

  res.json({
    performance: performanceStats,
    cache: cacheStats,
    database: dbStats,
    queue: queueStats,
    scaling: scalingMetrics,
    slowRequests: performanceMonitor.getSlowRequests().slice(0, 10),
    endpointStats: performanceMonitor.getEndpointStats(),
    timestamp: new Date().toISOString(),
  });
});

// Performance metrics for specific endpoint analysis
app.get('/metrics/endpoints', (req: Request, res: Response) => {
  res.json({
    endpoints: performanceMonitor.getEndpointStats(),
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.get('/api', (req: Request, res: Response) => {
  res.json({
    message: 'Demand Letter Generator API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      documents: '/api/documents',
      templates: '/api/templates',
      demandLetters: '/api/demand-letters',
      collaboration: '/api/collaboration',
      changeTracking: '/api/change-tracking',
      aiPrompts: '/api/ai-prompts',
    },
    websocket: {
      collaboration: '/collaboration',
    },
  });
});

// Mount auth routes
app.use('/api/auth', authRoutes);

// Mount document routes
app.use('/api/documents', documentRoutes);

// Mount demand letter routes
app.use('/api/demand-letters', demandLetterRoutes);

// Mount template routes
app.use('/api/templates', templateRoutes);

// Mount collaboration routes
app.use('/api/collaboration', collaborationRoutes);

// Mount change tracking routes
app.use('/api/change-tracking', changeTrackingRoutes);

// Mount AI prompts routes
app.use('/api/ai-prompts', aiPromptsRoutes);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err.message);

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV === 'development';

  res.status(500).json({
    error: 'Internal Server Error',
    message: isDev ? err.message : undefined,
    stack: isDev ? err.stack : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start server
const startServer = () => {
  // Check if HTTPS is configured
  const sslKeyPath = process.env.SSL_KEY_PATH;
  const sslCertPath = process.env.SSL_CERT_PATH;

  let httpServer: http.Server | https.Server;

  if (sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
    // Start HTTPS server
    const httpsOptions = {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath),
    };

    httpServer = https.createServer(httpsOptions, app);
    httpServer.listen(PORT, () => {
      console.log(`Backend API server running on https://localhost:${PORT}`);
      console.log(`Health check: https://localhost:${PORT}/health`);
      console.log(`WebSocket: wss://localhost:${PORT}/collaboration`);
    });
  } else {
    // Start HTTP server (for development or when behind a TLS-terminating proxy like Vercel)
    httpServer = http.createServer(app);
    httpServer.listen(PORT, () => {
      console.log(`Backend API server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`WebSocket: ws://localhost:${PORT}/collaboration`);

      if (process.env.NODE_ENV === 'production') {
        console.log('Note: Running HTTP in production. Ensure TLS is handled by reverse proxy.');
      }
    });
  }

  // Initialize WebSocket collaboration server
  const io = initializeCollaboration(httpServer);
  console.log('[Collaboration] WebSocket server initialized');

  return { httpServer, io };
};

const { httpServer, io } = startServer();

export { app, httpServer, io };
export default app;

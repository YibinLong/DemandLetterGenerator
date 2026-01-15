/**
 * Test Application Setup
 * Creates an Express app instance for integration testing without starting a server
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Create Express app
export const createTestApp = async () => {
  // Lazy import to avoid side effects from index.ts
  const { initializeDatabase, getDatabase } = await import('../../db/index.js');
  const { getDatabasePool } = await import('../../db/pool.js');
  const { default: authRoutes } = await import('../../routes/auth.js');
  const { default: documentRoutes } = await import('../../routes/documents.js');
  const { default: demandLetterRoutes } = await import('../../routes/demand-letters.js');
  const { default: templateRoutes } = await import('../../routes/templates.js');
  const { default: collaborationRoutes } = await import('../../routes/collaboration.js');
  const { default: changeTrackingRoutes } = await import('../../routes/change-tracking.js');
  const { default: aiPromptsRoutes } = await import('../../routes/ai-prompts.js');
  const { generalRateLimit } = await import('../../middleware/rateLimit.js');
  const { performanceMiddleware } = await import('../../services/performance.js');
  const { scalingMiddleware, initializeScaling, getMetricsCollector } = await import('../../services/scaling.js');
  const { cache } = await import('../../services/cache.js');
  const { getRequestQueue } = await import('../../services/requestQueue.js');

  // Initialize database
  initializeDatabase();

  // Initialize infrastructure
  const dbPool = getDatabasePool();
  const scaling = initializeScaling();
  const requestQueue = getRequestQueue();

  const app = express();

  // Trust proxy
  app.set('trust proxy', 1);

  // Security middleware (relaxed for testing)
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled for testing
  }));

  // CORS
  app.use(cors({
    origin: true,
    credentials: true,
  }));

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Performance monitoring
  app.use(performanceMiddleware);

  // Scaling metrics
  app.use(scalingMiddleware());

  // Rate limiting (can be skipped in tests by setting env var)
  if (process.env.DISABLE_RATE_LIMIT !== 'true') {
    app.use('/api', generalRateLimit);
  }

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    const dbHealth = dbPool.healthCheck();
    res.json({
      status: dbHealth.healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
    });
  });

  // Metrics endpoint
  app.get('/metrics', (req: Request, res: Response) => {
    const scalingMetrics = getMetricsCollector().getMetrics();
    res.json({
      scaling: scalingMetrics,
      timestamp: new Date().toISOString(),
    });
  });

  // API info
  app.get('/api', (req: Request, res: Response) => {
    res.json({
      message: 'Demand Letter Generator API',
      version: '1.0.0',
    });
  });

  // Mount routes
  app.use('/api/auth', authRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/demand-letters', demandLetterRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/collaboration', collaborationRoutes);
  app.use('/api/change-tracking', changeTrackingRoutes);
  app.use('/api/ai-prompts', aiPromptsRoutes);

  // Error handling
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Test error:', err.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return { app, dbPool, scaling, requestQueue, getDatabase };
};

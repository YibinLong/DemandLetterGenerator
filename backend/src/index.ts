import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase, getDatabase } from './db/index.js';
import authRoutes from './routes/auth.js';
import { generalRateLimit, startRateLimitCleanup } from './middleware/rateLimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Initialize database
initializeDatabase();

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

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply general rate limiting to all API routes
app.use('/api', generalRateLimit);

// Health check endpoint (no rate limiting)
app.get('/health', (req: Request, res: Response) => {
  const db = getDatabase();
  let dbStatus = 'connected';
  try {
    db.prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }

  res.json({
    status: 'healthy',
    service: 'backend-api',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
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
    },
  });
});

// Mount auth routes
app.use('/api/auth', authRoutes);

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

  if (sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
    // Start HTTPS server
    const httpsOptions = {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath),
    };

    https.createServer(httpsOptions, app).listen(PORT, () => {
      console.log(`Backend API server running on https://localhost:${PORT}`);
      console.log(`Health check: https://localhost:${PORT}/health`);
    });
  } else {
    // Start HTTP server (for development or when behind a TLS-terminating proxy like Vercel)
    app.listen(PORT, () => {
      console.log(`Backend API server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);

      if (process.env.NODE_ENV === 'production') {
        console.log('Note: Running HTTP in production. Ensure TLS is handled by reverse proxy.');
      }
    });
  }
};

startServer();

export default app;

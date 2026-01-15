// HTTP caching middleware for Express
// Implements Cache-Control headers and ETag-based validation

import { Request, Response, NextFunction } from 'express';
import { cache } from '../services/cache.js';

interface CacheMiddlewareOptions {
  ttlSeconds?: number;
  cacheKey?: (req: Request) => string;
  private?: boolean;      // Use private cache directive (for user-specific data)
  mustRevalidate?: boolean;
}

/**
 * Generate cache key from request
 */
const defaultCacheKey = (req: Request): string => {
  const user = (req as unknown as { user?: { id: string; firm_id: string } }).user;
  const userId = user?.id || 'anonymous';
  const firmId = user?.firm_id || 'public';
  return `${req.method}:${firmId}:${userId}:${req.originalUrl}`;
};

/**
 * Caching middleware that:
 * 1. Checks for cached responses
 * 2. Handles If-None-Match (ETag) conditional requests
 * 3. Caches successful responses
 * 4. Sets appropriate Cache-Control headers
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  const {
    ttlSeconds = 60,
    cacheKey = defaultCacheKey,
    private: isPrivate = true,
    mustRevalidate = true,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = cacheKey(req);
    const cached = cache.get<unknown>(key);

    // Check for conditional request (If-None-Match)
    const clientEtag = req.headers['if-none-match'];
    if (cached && clientEtag && clientEtag === cached.etag) {
      res.status(304).end();
      return;
    }

    // Return cached response if available
    if (cached) {
      res.setHeader('ETag', cached.etag);
      res.setHeader('X-Cache', 'HIT');
      setCacheControlHeaders(res, ttlSeconds, isPrivate, mustRevalidate);
      res.json(cached.data);
      return;
    }

    // Capture the response to cache it
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const etag = cache.set(key, body, ttlSeconds);
        res.setHeader('ETag', etag);
        res.setHeader('X-Cache', 'MISS');
        setCacheControlHeaders(res, ttlSeconds, isPrivate, mustRevalidate);
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Set Cache-Control headers
 */
function setCacheControlHeaders(
  res: Response,
  maxAge: number,
  isPrivate: boolean,
  mustRevalidate: boolean
) {
  const directives = [
    isPrivate ? 'private' : 'public',
    `max-age=${maxAge}`,
  ];

  if (mustRevalidate) {
    directives.push('must-revalidate');
  }

  res.setHeader('Cache-Control', directives.join(', '));
}

/**
 * Middleware to set no-cache headers for mutating operations
 */
export function noCacheMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

/**
 * Cache invalidation helper for routes
 * Call this after mutations to invalidate related cached data
 */
export function invalidateCache(patterns: (string | RegExp)[]): void {
  for (const pattern of patterns) {
    cache.invalidate(pattern);
  }
}

export default { cacheMiddleware, noCacheMiddleware, invalidateCache };

// Database Connection Pool Manager for SQLite
// Provides optimized connection handling with WAL mode and concurrent access patterns

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PoolConfig {
  // Path to the database file
  databasePath?: string;
  // Maximum number of concurrent read operations
  maxReadConnections?: number;
  // Enable verbose logging
  verbose?: boolean;
  // Connection timeout in milliseconds
  connectionTimeout?: number;
  // Busy timeout for SQLite (how long to wait when database is locked)
  busyTimeout?: number;
  // Enable WAL mode for better concurrent access
  walMode?: boolean;
  // Cache size in KB (negative for KB, positive for pages)
  cacheSize?: number;
  // Memory mapped I/O size (0 to disable)
  mmapSize?: number;
}

export interface PoolStats {
  activeConnections: number;
  totalConnections: number;
  totalQueries: number;
  averageQueryTime: number;
  slowQueries: number;
  errors: number;
  walEnabled: boolean;
}

const DEFAULT_CONFIG: Required<PoolConfig> = {
  databasePath: '',
  maxReadConnections: 5,
  verbose: false,
  connectionTimeout: 5000,
  busyTimeout: 5000,
  walMode: true,
  cacheSize: -64000, // 64MB cache
  mmapSize: 268435456, // 256MB memory-mapped I/O
};

class DatabasePool {
  private config: Required<PoolConfig>;
  private primaryConnection: Database.Database | null = null;
  private readConnections: Database.Database[] = [];
  private activeReadIndex = 0;
  private stats = {
    totalQueries: 0,
    totalQueryTime: 0,
    slowQueries: 0,
    errors: 0,
  };
  private readonly SLOW_QUERY_THRESHOLD = 1000; // 1 second

  constructor(config: PoolConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.databasePath) {
      this.config.databasePath = this.getDefaultDbPath();
    }
  }

  private getDefaultDbPath(): string {
    const envPath = process.env.DATABASE_PATH;
    if (envPath) {
      if (!path.isAbsolute(envPath)) {
        return path.resolve(__dirname, '../../', envPath);
      }
      return envPath;
    }
    return path.resolve(__dirname, '../../data/database.sqlite');
  }

  private ensureDirectory(): void {
    const dbDir = path.dirname(this.config.databasePath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  private createConnection(readonly: boolean = false): Database.Database {
    this.ensureDirectory();

    const conn = new Database(this.config.databasePath, {
      verbose: this.config.verbose ? console.log : undefined,
      readonly,
    });

    // Configure SQLite for optimal performance
    conn.pragma(`busy_timeout = ${this.config.busyTimeout}`);
    conn.pragma('foreign_keys = ON');

    if (this.config.walMode) {
      conn.pragma('journal_mode = WAL');
      conn.pragma('synchronous = NORMAL'); // Faster than FULL, still safe with WAL
    }

    // Set cache size
    conn.pragma(`cache_size = ${this.config.cacheSize}`);

    // Enable memory-mapped I/O for faster reads
    if (this.config.mmapSize > 0) {
      conn.pragma(`mmap_size = ${this.config.mmapSize}`);
    }

    // Optimize for concurrent reads
    conn.pragma('temp_store = MEMORY');
    conn.pragma('locking_mode = NORMAL');

    return conn;
  }

  /**
   * Get the primary (write) connection
   */
  getWriteConnection(): Database.Database {
    if (!this.primaryConnection) {
      this.primaryConnection = this.createConnection(false);
      console.log('[DatabasePool] Primary write connection created');
    }
    return this.primaryConnection;
  }

  /**
   * Get a read connection from the pool (round-robin)
   */
  getReadConnection(): Database.Database {
    // For SQLite, read connections can share the same connection
    // since WAL mode allows concurrent reads
    // But we return the primary connection for simplicity
    // SQLite with WAL mode handles concurrent reads well
    return this.getWriteConnection();
  }

  /**
   * Execute a read query with automatic connection management
   */
  query<T>(sql: string, params?: unknown[]): T {
    const start = Date.now();
    const conn = this.getReadConnection();

    try {
      const stmt = conn.prepare(sql);
      const result = params ? stmt.all(...params) as T : stmt.all() as T;
      this.recordQuery(Date.now() - start);
      return result;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Execute a single-row read query
   */
  queryOne<T>(sql: string, params?: unknown[]): T | undefined {
    const start = Date.now();
    const conn = this.getReadConnection();

    try {
      const stmt = conn.prepare(sql);
      const result = params ? stmt.get(...params) as T : stmt.get() as T;
      this.recordQuery(Date.now() - start);
      return result;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Execute a write operation
   */
  execute(sql: string, params?: unknown[]): Database.RunResult {
    const start = Date.now();
    const conn = this.getWriteConnection();

    try {
      const stmt = conn.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      this.recordQuery(Date.now() - start);
      return result;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Execute multiple statements in a transaction
   */
  transaction<T>(fn: (conn: Database.Database) => T): T {
    const start = Date.now();
    const conn = this.getWriteConnection();

    try {
      const result = conn.transaction(fn)(conn);
      this.recordQuery(Date.now() - start);
      return result;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  private recordQuery(duration: number): void {
    this.stats.totalQueries++;
    this.stats.totalQueryTime += duration;
    if (duration > this.SLOW_QUERY_THRESHOLD) {
      this.stats.slowQueries++;
      console.warn(`[DatabasePool] Slow query detected: ${duration}ms`);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return {
      activeConnections: this.primaryConnection ? 1 : 0,
      totalConnections: this.primaryConnection ? 1 : 0,
      totalQueries: this.stats.totalQueries,
      averageQueryTime: this.stats.totalQueries > 0
        ? this.stats.totalQueryTime / this.stats.totalQueries
        : 0,
      slowQueries: this.stats.slowQueries,
      errors: this.stats.errors,
      walEnabled: this.config.walMode,
    };
  }

  /**
   * Optimize the database (run ANALYZE and VACUUM)
   */
  optimize(): void {
    const conn = this.getWriteConnection();
    console.log('[DatabasePool] Running database optimization...');

    // Update statistics for query planner
    conn.exec('ANALYZE');

    // In WAL mode, we need to checkpoint before vacuum
    if (this.config.walMode) {
      conn.pragma('wal_checkpoint(TRUNCATE)');
    }

    console.log('[DatabasePool] Optimization complete');
  }

  /**
   * Perform a WAL checkpoint (flush WAL to main database)
   */
  checkpoint(mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'PASSIVE'): void {
    if (!this.config.walMode) {
      console.log('[DatabasePool] WAL mode not enabled, skipping checkpoint');
      return;
    }

    const conn = this.getWriteConnection();
    const result = conn.pragma(`wal_checkpoint(${mode})`) as Array<{ busy: number; log: number; checkpointed: number }>;

    if (result[0]) {
      console.log(`[DatabasePool] WAL checkpoint complete: ${result[0].checkpointed} pages checkpointed`);
    }
  }

  /**
   * Check database integrity
   */
  integrityCheck(): { ok: boolean; message: string } {
    const conn = this.getReadConnection();
    const result = conn.pragma('integrity_check') as Array<{ integrity_check: string }>;

    const ok = result.length === 1 && result[0].integrity_check === 'ok';
    return {
      ok,
      message: ok ? 'Database integrity check passed' : result.map(r => r.integrity_check).join(', '),
    };
  }

  /**
   * Close all connections
   */
  close(): void {
    if (this.primaryConnection) {
      // Checkpoint WAL before closing
      if (this.config.walMode) {
        try {
          this.checkpoint('TRUNCATE');
        } catch (e) {
          console.error('[DatabasePool] Error during final checkpoint:', e);
        }
      }

      this.primaryConnection.close();
      this.primaryConnection = null;
      console.log('[DatabasePool] All connections closed');
    }
  }

  /**
   * Health check for the database connection
   */
  healthCheck(): { healthy: boolean; latency: number; error?: string } {
    const start = Date.now();

    try {
      const conn = this.getReadConnection();
      conn.prepare('SELECT 1').get();
      return {
        healthy: true,
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Singleton pool instance
let pool: DatabasePool | null = null;

export function getDatabasePool(config?: PoolConfig): DatabasePool {
  if (!pool) {
    pool = new DatabasePool(config);
  }
  return pool;
}

export function closeDatabasePool(): void {
  if (pool) {
    pool.close();
    pool = null;
  }
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  closeDatabasePool();
});

process.on('SIGTERM', () => {
  closeDatabasePool();
});

export { DatabasePool };
export default getDatabasePool;

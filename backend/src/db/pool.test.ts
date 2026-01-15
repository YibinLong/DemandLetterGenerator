// Tests for Database Connection Pool
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabasePool, getDatabasePool, closeDatabasePool } from './pool.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('DatabasePool', () => {
  let pool: DatabasePool;
  const testDbPath = path.resolve(__dirname, '../../data/test-pool.sqlite');

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      fs.unlinkSync(`${testDbPath}-wal`);
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      fs.unlinkSync(`${testDbPath}-shm`);
    }

    pool = new DatabasePool({
      databasePath: testDbPath,
      walMode: true,
      verbose: false,
    });
  });

  afterEach(() => {
    pool.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      fs.unlinkSync(`${testDbPath}-wal`);
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      fs.unlinkSync(`${testDbPath}-shm`);
    }
  });

  describe('Connection Management', () => {
    it('should create a write connection', () => {
      const conn = pool.getWriteConnection();
      expect(conn).toBeDefined();
    });

    it('should reuse the same write connection', () => {
      const conn1 = pool.getWriteConnection();
      const conn2 = pool.getWriteConnection();
      expect(conn1).toBe(conn2);
    });

    it('should get a read connection', () => {
      const conn = pool.getReadConnection();
      expect(conn).toBeDefined();
    });
  });

  describe('Query Operations', () => {
    beforeEach(() => {
      // Create a test table
      const conn = pool.getWriteConnection();
      conn.exec(`
        CREATE TABLE IF NOT EXISTS test_items (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          value INTEGER
        )
      `);
    });

    it('should execute insert operations', () => {
      const result = pool.execute(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        ['test', 42]
      );
      expect(result.changes).toBe(1);
    });

    it('should query all rows', () => {
      pool.execute('INSERT INTO test_items (name, value) VALUES (?, ?)', ['item1', 1]);
      pool.execute('INSERT INTO test_items (name, value) VALUES (?, ?)', ['item2', 2]);

      const results = pool.query<{ id: number; name: string; value: number }[]>(
        'SELECT * FROM test_items'
      );
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('item1');
      expect(results[1].name).toBe('item2');
    });

    it('should query a single row', () => {
      pool.execute('INSERT INTO test_items (name, value) VALUES (?, ?)', ['single', 99]);

      const result = pool.queryOne<{ id: number; name: string; value: number }>(
        'SELECT * FROM test_items WHERE name = ?',
        ['single']
      );
      expect(result).toBeDefined();
      expect(result?.value).toBe(99);
    });

    it('should return undefined for non-existent row', () => {
      const result = pool.queryOne<{ id: number }>(
        'SELECT * FROM test_items WHERE name = ?',
        ['nonexistent']
      );
      expect(result).toBeUndefined();
    });
  });

  describe('Transaction Support', () => {
    beforeEach(() => {
      const conn = pool.getWriteConnection();
      conn.exec(`
        CREATE TABLE IF NOT EXISTS test_items (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        )
      `);
    });

    it('should execute operations in a transaction', () => {
      pool.transaction((conn) => {
        conn.prepare('INSERT INTO test_items (name) VALUES (?)').run('tx1');
        conn.prepare('INSERT INTO test_items (name) VALUES (?)').run('tx2');
        return true;
      });

      const results = pool.query<{ name: string }[]>('SELECT name FROM test_items');
      expect(results).toHaveLength(2);
    });

    it('should rollback transaction on error', () => {
      try {
        pool.transaction((conn) => {
          conn.prepare('INSERT INTO test_items (name) VALUES (?)').run('will_rollback');
          throw new Error('Intentional error');
        });
      } catch {
        // Expected error
      }

      const results = pool.query<{ name: string }[]>('SELECT name FROM test_items');
      expect(results).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    it('should track query statistics', () => {
      const conn = pool.getWriteConnection();
      conn.exec('CREATE TABLE test (id INTEGER)');

      pool.execute('INSERT INTO test VALUES (?)', [1]);
      pool.query('SELECT * FROM test');

      const stats = pool.getStats();
      expect(stats.totalQueries).toBe(2);
      expect(stats.activeConnections).toBe(1);
    });

    it('should track slow queries', () => {
      const conn = pool.getWriteConnection();
      conn.exec('CREATE TABLE test (id INTEGER)');

      // Normal queries shouldn't be slow
      for (let i = 0; i < 5; i++) {
        pool.execute('INSERT INTO test VALUES (?)', [i]);
      }

      const stats = pool.getStats();
      expect(stats.slowQueries).toBe(0);
    });

    it('should report WAL mode status', () => {
      const stats = pool.getStats();
      expect(stats.walEnabled).toBe(true);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status for working database', () => {
      const health = pool.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integrity Check', () => {
    it('should pass integrity check for valid database', () => {
      const result = pool.integrityCheck();
      expect(result.ok).toBe(true);
      expect(result.message).toBe('Database integrity check passed');
    });
  });

  describe('Optimization', () => {
    it('should run optimization without errors', () => {
      const conn = pool.getWriteConnection();
      conn.exec('CREATE TABLE test (id INTEGER)');
      conn.exec('INSERT INTO test VALUES (1), (2), (3)');

      // Should not throw
      expect(() => pool.optimize()).not.toThrow();
    });
  });

  describe('Checkpoint', () => {
    it('should run WAL checkpoint without errors', () => {
      const conn = pool.getWriteConnection();
      conn.exec('CREATE TABLE test (id INTEGER)');
      conn.exec('INSERT INTO test VALUES (1)');

      // Should not throw
      expect(() => pool.checkpoint('PASSIVE')).not.toThrow();
    });
  });
});

describe('getDatabasePool singleton', () => {
  afterEach(() => {
    closeDatabasePool();
  });

  it('should return the same pool instance', () => {
    const pool1 = getDatabasePool();
    const pool2 = getDatabasePool();
    expect(pool1).toBe(pool2);
  });

  it('should create a new pool after closing', () => {
    const pool1 = getDatabasePool();
    closeDatabasePool();
    const pool2 = getDatabasePool();
    // After close and re-get, should be a new instance
    expect(pool2).toBeDefined();
  });
});

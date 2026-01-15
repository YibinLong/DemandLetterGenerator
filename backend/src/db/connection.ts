// Database connection module using better-sqlite3
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database.Database | null = null;

export interface DatabaseConfig {
  path: string;
  verbose?: boolean;
}

function getDefaultDbPath(): string {
  const envPath = process.env.DATABASE_PATH;
  if (envPath) {
    // If relative path, resolve from backend root
    if (!path.isAbsolute(envPath)) {
      return path.resolve(__dirname, '../../', envPath);
    }
    return envPath;
  }
  return path.resolve(__dirname, '../../data/database.sqlite');
}

export function getDatabase(config?: Partial<DatabaseConfig>): Database.Database {
  if (db) return db;

  const dbPath = config?.path || getDefaultDbPath();

  // Ensure the directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Create database connection
  db = new Database(dbPath, {
    verbose: config?.verbose ? console.log : undefined
  });

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  return db;
}

export function initializeDatabase(): void {
  const database = getDatabase();

  // Check if schema is already initialized
  const tableExists = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='schema_migrations'
  `).get();

  if (!tableExists) {
    console.log('Initializing database schema...');
    database.exec(CREATE_TABLES_SQL);

    // Record the schema version
    database.prepare(`
      INSERT INTO schema_migrations (version, description)
      VALUES (?, ?)
    `).run(SCHEMA_VERSION, 'Initial schema creation');

    console.log(`Database initialized with schema version ${SCHEMA_VERSION}`);
  } else {
    // Check current schema version
    const currentVersion = database.prepare(`
      SELECT MAX(version) as version FROM schema_migrations
    `).get() as { version: number } | undefined;

    console.log(`Database already initialized at schema version ${currentVersion?.version || 0}`);

    // Run any pending migrations
    if (currentVersion && currentVersion.version < SCHEMA_VERSION) {
      runMigrations(database, currentVersion.version);
    }
  }
}

function runMigrations(database: Database.Database, fromVersion: number): void {
  console.log(`Running migrations from version ${fromVersion} to ${SCHEMA_VERSION}...`);

  // Migration functions keyed by target version
  const migrations: Record<number, () => void> = {
    // Migration to add audit_logs and rate_limits tables
    2: () => {
      database.exec(`
        -- Audit logs table for compliance tracking
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          user_id TEXT,
          firm_id TEXT,
          resource_type TEXT,
          resource_id TEXT,
          details TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE SET NULL
        );

        -- Rate limit tracking table
        CREATE TABLE IF NOT EXISTS rate_limits (
          id TEXT PRIMARY KEY,
          identifier TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          request_count INTEGER NOT NULL DEFAULT 1,
          window_start TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(identifier, endpoint)
        );

        -- Create indexes for audit_logs
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_firm_id ON audit_logs(firm_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier);
      `);
    },
    // Migration to add content_html columns for rich text editing
    3: () => {
      database.exec(`
        -- Add content_html column to demand_letters table
        ALTER TABLE demand_letters ADD COLUMN content_html TEXT;

        -- Add content_html column to demand_letter_versions table
        ALTER TABLE demand_letter_versions ADD COLUMN content_html TEXT;
      `);
    },
  };

  for (let version = fromVersion + 1; version <= SCHEMA_VERSION; version++) {
    if (migrations[version]) {
      console.log(`Applying migration to version ${version}...`);
      migrations[version]();
      database.prepare(`
        INSERT INTO schema_migrations (version, description)
        VALUES (?, ?)
      `).run(version, `Migration to version ${version}`);
    }
  }

  console.log('Migrations complete');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});

export default getDatabase;

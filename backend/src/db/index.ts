// Database module exports
export { getDatabase, initializeDatabase, closeDatabase } from './connection.js';
export type { DatabaseConfig } from './connection.js';
export { getDatabasePool, closeDatabasePool, DatabasePool } from './pool.js';
export type { PoolConfig, PoolStats } from './pool.js';
export {
  SCHEMA_VERSION,
  CREATE_TABLES_SQL,
  type Firm,
  type User,
  type Document,
  type Template,
  type DemandLetter,
  type DemandLetterVersion,
  type DemandLetterDocument,
  type AIGenerationHistory,
  type SchemaMigration
} from './schema.js';

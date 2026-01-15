import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'src/tests/integration/**', // Integration tests run separately
      'src/tests/load-test.ts', // Load tests run separately
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/db/**/*.ts',
        'src/services/**/*.ts',
        'src/auth/**/*.ts',
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/tests/**',
        'src/types/**',
        'src/index.ts', // Main entry point - tested via integration tests
        'src/routes/**', // Routes tested via integration tests
        'src/middleware/**', // Middleware tested via integration tests
        'src/db/seed.ts', // Seed script not tested
        'src/db/connection.ts', // Uses pool.ts instead
        'src/db/index.ts', // Re-exports only
        'src/services/collaboration.ts', // WebSocket service - complex mocking required
        'src/services/audit.ts', // Depends on database - tested via database tests
      ],
      thresholds: {
        lines: 80,
        functions: 70,
        branches: 65,
        statements: 80
      }
    },
    testTimeout: 10000
  }
});

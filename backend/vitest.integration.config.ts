import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/integration/**/*.test.ts'],
    testTimeout: 30000, // Integration tests may take longer
    hookTimeout: 30000,
    isolate: false, // Share state between tests in the same file
    sequence: {
      shuffle: false, // Run tests in order for integration tests
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/routes/**/*.ts',
        'src/middleware/**/*.ts',
        'src/index.ts',
      ],
      exclude: [
        'node_modules/**',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
  },
});

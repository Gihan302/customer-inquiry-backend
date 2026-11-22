// Written with CommonJS `module.exports` (this package is "type": "commonjs"),
// so Node can load the file directly without an ESM-interop warning.
const config: import('jest').Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Forces NODE_ENV=test before any app code loads, so only the test database is used.
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  clearMocks: true,
  restoreMocks: true,
  // Integration tests share one test database, so run them one at a time.
  maxWorkers: 1,
};

module.exports = config;

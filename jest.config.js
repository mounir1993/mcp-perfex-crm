/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          moduleResolution: 'node',
          allowSyntheticDefaultImports: true
        }
      }
    ]
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.spec.ts'],
  // Exclude MySQL client tests that require database connection
  testPathIgnorePatterns: [
    '/node_modules/',
    'mysql-client\\.test\\.ts$'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/tools/core/archive/**',
    '!src/tools/core/backup/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
  // Coverage thresholds disabled for development
  // Uncomment the following when running full test suite for CI/CD
  /*
  ,coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
  */
};
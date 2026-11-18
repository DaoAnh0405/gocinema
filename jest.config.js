module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/tests'],
  testMatch: ['**/*Test.js'],
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/tests/**'],
};

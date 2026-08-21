import { defineConfig } from 'cypress';

export default defineConfig({
  allowCypressEnv: false,
  e2e: {
    baseUrl: 'http://127.0.0.1:4173',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js'
  },
  defaultCommandTimeout: 6000,
  requestTimeout: 6000,
  retries: 0,
  screenshotOnRunFailure: true,
  screenshotsFolder: '/tmp/cypress/screenshots',
  video: false,
  viewportHeight: 800,
  viewportWidth: 1280
});

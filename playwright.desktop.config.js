// Desktop-only Playwright config. Browser tests should keep using the existing browser workflow.
module.exports = {
  testDir: './tests/desktop',
  // Aborts the run if port 3000 is taken — otherwise the specs silently test the
  // already-running app's server instead of their own. See the file for why.
  globalSetup: require.resolve('./tests/desktop/globalSetup.js'),
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  outputDir: 'test-results/desktop'
};

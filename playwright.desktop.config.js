// Desktop-only Playwright config. Browser tests should keep using the existing browser workflow.
module.exports = {
  testDir: './tests/desktop',
  // Hands the run its own free CUBRIC_PORT, so the specs can never attach to an
  // already-running app's server instead of their own. See the file for why.
  globalSetup: require.resolve('./tests/desktop/globalSetup.js'),
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Video only when running locally. A failing CI run recorded ~150 MB of
    // Electron video per upload; the trace already carries the DOM snapshots
    // and the screenshot the failure, for a fraction of the Actions storage.
    video: process.env.CI ? 'off' : 'retain-on-failure'
  },
  outputDir: 'test-results/desktop'
};

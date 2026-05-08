// Desktop-only Playwright config. Browser tests should keep using the existing browser workflow.
module.exports = {
  testDir: './tests/desktop',
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

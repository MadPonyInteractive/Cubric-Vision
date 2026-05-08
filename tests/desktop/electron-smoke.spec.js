const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');

test('desktop app launches and loads the local shell', async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath('user-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.CUBRIC_E2E = '1';
  env.CUBRIC_E2E_USER_DATA = userDataDir;

  const app = await electron.launch({
    args: ['.'],
    env
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window).toHaveURL(/127\.0\.0\.1:3000/);
    await expect(window).toHaveTitle(/Cubric/i);

    const bodyText = await window.locator('body').innerText({ timeout: 10000 });
    expect(bodyText.trim().length).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});

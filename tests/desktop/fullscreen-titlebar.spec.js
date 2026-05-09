const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');

test('F11 fullscreen hides the custom titlebar and removes the shell offset', async ({}, testInfo) => {
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

    await window.keyboard.press('F11');
    await expect(window.locator('body')).toHaveClass(/window-fullscreen/);

    const layout = await window.evaluate(() => {
      const titlebar = document.getElementById('titlebar');
      const shell = document.querySelector('.app-shell');
      return {
        titlebarDisplay: getComputedStyle(titlebar).display,
        shellMarginTop: getComputedStyle(shell).marginTop,
        shellHeight: getComputedStyle(shell).height
      };
    });

    expect(layout.titlebarDisplay).toBe('none');
    expect(layout.shellMarginTop).toBe('0px');
    expect(layout.shellHeight).toBe(`${await window.evaluate(() => window.innerHeight)}px`);
  } finally {
    await app.close();
  }
});

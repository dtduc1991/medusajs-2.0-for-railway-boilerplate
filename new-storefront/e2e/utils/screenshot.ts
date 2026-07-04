import type { Page, TestInfo } from '@playwright/test';

/**
 * Explicit checkpoint screenshot, saved via testInfo.outputPath so it lands
 * in the same per-test test-results/ folder as everything else and is
 * attached to the HTML report — unlike the blanket `screenshot: 'on'` config
 * option (one shot at test end), this captures the app mid-flow at whatever
 * points the spec calls it.
 */
export async function snap(page: Page, testInfo: TestInfo, step: string): Promise<void> {
  const path = testInfo.outputPath(`${step}.png`);
  await page.screenshot({ path });
  await testInfo.attach(step, { path, contentType: 'image/png' });
}

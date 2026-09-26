import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';

const outDir = path.join(__dirname, '../../../docs/screenshots');

async function selectOption(page: Page, label: string, optionText: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

test.describe('docs screenshots', () => {
  test.skip(!process.env.CAPTURE_SCREENSHOTS, 'set CAPTURE_SCREENSHOTS=1 to capture');

  test('capture request, active ride, driver pool, history', async ({ browser }) => {
    const driverContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const passengerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const driver = await driverContext.newPage();
    const nusrat = await passengerContext.newPage();

    await driver.goto('/');
    await driver.getByRole('button', { name: 'Continue as Jashim' }).click();
    await driver.waitForURL(/\/drive/);
    await selectOption(driver, 'Current zone', 'Banani');
    const online = driver.locator('#online-switch');
    if (!(await online.isChecked())) await online.click();
    await expect(driver.getByText('Accepting riders in Banani')).toBeVisible();

    await nusrat.goto('/');
    await nusrat.getByRole('button', { name: 'Continue as Nusrat' }).click();
    await nusrat.waitForURL(/\/ride/);
    await selectOption(nusrat, 'Pickup', 'Banani');
    await selectOption(nusrat, 'Destination', 'Mohakhali');
    await expect(nusrat.getByText('Fare quote')).toBeVisible();
    await nusrat.screenshot({ path: path.join(outDir, '01-request-form.png'), fullPage: true });

    await nusrat.getByRole('button', { name: 'Request Tesla' }).click();
    await nusrat.waitForURL(/\/ride\/[0-9a-f-]+/i);

    await expect(driver.getByText(/Nusrat → Mohakhali/)).toBeVisible({ timeout: 15_000 });
    await driver.getByRole('button', { name: 'Accept' }).click();
    await expect(driver.getByLabel('1 of 3 seats taken')).toBeVisible({ timeout: 15_000 });

    const rafiqContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const rafiq = await rafiqContext.newPage();
    await rafiq.goto('/');
    await rafiq.getByRole('button', { name: 'Continue as Rafiq' }).click();
    await rafiq.waitForURL(/\/ride/);
    await selectOption(rafiq, 'Pickup', 'Banani');
    await selectOption(rafiq, 'Destination', 'Gulshan 1');
    await rafiq.getByRole('button', { name: 'Request Tesla' }).click();
    await rafiq.waitForURL(/\/ride\/[0-9a-f-]+/i);

    await expect(nusrat.getByText('৳90.00').first()).toBeVisible({ timeout: 20_000 });
    await expect(driver.getByLabel('2 of 3 seats taken')).toBeVisible({ timeout: 15_000 });

    await nusrat.screenshot({ path: path.join(outDir, '02-active-ride.png'), fullPage: true });
    await driver.screenshot({ path: path.join(outDir, '03-driver-pool.png'), fullPage: true });

    await driver.getByRole('button', { name: 'Arrived' }).click();
    await driver.getByRole('button', { name: 'Start trip' }).click();
    await driver.getByRole('button', { name: 'Complete trip' }).click();
    await driver.getByRole('dialog').getByRole('button', { name: 'Complete trip' }).click();
    await expect(nusrat.getByRole('heading', { name: 'Trip complete' })).toBeVisible({
      timeout: 20_000,
    });

    await nusrat.goto('/history');
    await expect(nusrat.getByText('Banani → Mohakhali').first()).toBeVisible();
    await nusrat.screenshot({ path: path.join(outDir, '04-history.png'), fullPage: true });

    await rafiqContext.close();
    await passengerContext.close();
    await driverContext.close();
  });
});

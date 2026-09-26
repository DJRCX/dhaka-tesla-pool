import { expect, type Page, test } from '@playwright/test';

async function selectOption(page: Page, label: string, optionText: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

async function demoSignIn(page: Page, name: 'Jashim' | 'Nusrat' | 'Rafiq' | 'Shirin') {
  await page.goto('/');
  await page.getByRole('button', { name: `Continue as ${name}` }).click();
  await page.waitForURL(/\/(drive|ride)/);
}

async function requestRide(page: Page, pickup: string, dropoff: string) {
  await page.goto('/ride');
  await expect(page.getByRole('heading', { name: 'Request a ride' })).toBeVisible();
  await selectOption(page, 'Pickup', pickup);
  await selectOption(page, 'Destination', dropoff);
  await expect(page.getByText('Fare quote')).toBeVisible();
  await page.getByRole('button', { name: 'Request Tesla' }).click();
  await page.waitForURL(/\/ride\/[0-9a-f-]+/i);
}

test.describe('rush-hour pooling story', () => {
  test('Jashim pools Nusrat then auto-matches Rafiq through complete', async ({
    browser,
  }) => {
    const driverContext = await browser.newContext();
    const passengerContext = await browser.newContext();
    const driver = await driverContext.newPage();
    const nusrat = await passengerContext.newPage();

    await demoSignIn(driver, 'Jashim');
    await expect(driver).toHaveURL(/\/drive/);

    await selectOption(driver, 'Current zone', 'Banani');
    const online = driver.locator('#online-switch');
    if (!(await online.isChecked())) {
      await online.click();
    }
    await expect(
      driver.getByText(/Accepting riders in Banani|No riders waiting in Banani/),
    ).toBeVisible({ timeout: 15_000 });

    await demoSignIn(nusrat, 'Nusrat');
    await requestRide(nusrat, 'Banani', 'Mohakhali');
    await expect(
      nusrat.getByRole('heading', { name: 'Waiting for a Tesla in Banani' }),
    ).toBeVisible();

    await expect(driver.getByText(/Nusrat → Mohakhali/)).toBeVisible({ timeout: 15_000 });
    await driver.getByRole('button', { name: 'Accept' }).click();
    await expect(driver.getByLabel('1 of 3 seats taken')).toBeVisible({ timeout: 15_000 });
    await expect(
      nusrat.getByRole('heading', { name: 'Jashim is on the way in Bullet' }),
    ).toBeVisible({ timeout: 15_000 });

    const rafiqContext = await browser.newContext();
    const rafiq = await rafiqContext.newPage();
    await demoSignIn(rafiq, 'Rafiq');
    await requestRide(rafiq, 'Banani', 'Gulshan 1');

    await expect(nusrat.getByText('৳90.00').first()).toBeVisible({ timeout: 20_000 });
    await expect(rafiq.getByText('৳96.00').first()).toBeVisible({ timeout: 20_000 });
    await expect(driver.getByLabel('2 of 3 seats taken')).toBeVisible({ timeout: 15_000 });

    await driver.getByRole('button', { name: 'Arrived' }).click();
    await expect(driver.getByRole('button', { name: 'Start trip' })).toBeVisible({
      timeout: 10_000,
    });
    await driver.getByRole('button', { name: 'Start trip' }).click();
    await expect(driver.getByRole('button', { name: 'Complete trip' })).toBeVisible({
      timeout: 10_000,
    });
    await driver.getByRole('button', { name: 'Complete trip' }).click();
    await driver.getByRole('dialog').getByRole('button', { name: 'Complete trip' }).click();

    await expect(nusrat.getByRole('heading', { name: 'Trip complete' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(rafiq.getByRole('heading', { name: 'Trip complete' })).toBeVisible({
      timeout: 20_000,
    });

    await nusrat.goto('/history');
    await expect(nusrat.getByText('Banani → Mohakhali').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(nusrat.getByText('৳90.00').first()).toBeVisible();

    await rafiq.goto('/history');
    await expect(rafiq.getByText('Banani → Gulshan 1').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(rafiq.getByText('৳96.00').first()).toBeVisible();

    await rafiqContext.close();
    await passengerContext.close();
    await driverContext.close();
  });
});

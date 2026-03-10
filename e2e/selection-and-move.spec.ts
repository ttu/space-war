import { test, expect } from '@playwright/test';

test.describe('Ship selection and move command', () => {
  test('selecting a ship and right-clicking sets destination', async ({ page }) => {
    await page.goto('/?e2e=1');

    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();

    // Wait for the game module to run and attach input listeners (canvas is visible before script runs)
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => (window as unknown as { __spaceWarGame?: unknown }).__spaceWarGame != null,
          ),
        { timeout: 5000 },
      )
      .toBe(true);

    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas has no bounding box');
    const centerX = box.width / 2;
    const centerY = box.height / 2;

    // Click center of canvas (demo: flagship at 42000,0, camera centered there).
    // Use locator.click() so the event targets the canvas even with overlays on top.
    await canvas.click({ position: { x: centerX, y: centerY } });

    await expect
      .poll(
        async () => {
          const state = await page.evaluate(() => {
            const g = (window as unknown as { __spaceWarGame?: { getTestState(): { selectedCount: number; playerShipsWithMoveOrder: number; visibleDestinationMarkerCount: number } } }).__spaceWarGame;
            return g?.getTestState() ?? { selectedCount: 0, playerShipsWithMoveOrder: 0, visibleDestinationMarkerCount: 0 };
          });
          return state.selectedCount;
        },
        { timeout: 2000 },
      )
      .toBeGreaterThanOrEqual(1);

    // Right-click to the right of center to set destination
    await canvas.click({ position: { x: centerX + 120, y: centerY }, button: 'right' });

    await expect
      .poll(
        async () => {
          const state = await page.evaluate(() => {
            const g = (window as unknown as { __spaceWarGame?: { getTestState(): { selectedCount: number; playerShipsWithMoveOrder: number; visibleDestinationMarkerCount: number } } }).__spaceWarGame;
            return g?.getTestState() ?? { selectedCount: 0, playerShipsWithMoveOrder: 0, visibleDestinationMarkerCount: 0 };
          });
          return state.playerShipsWithMoveOrder;
        },
        { timeout: 2000 },
      )
      .toBeGreaterThanOrEqual(1);

    // Destination marker is shown for active nav orders (phase !== 'arrived')
    await expect
      .poll(
        async () => {
          const state = await page.evaluate(() => {
            const g = (window as unknown as { __spaceWarGame?: { getTestState(): { visibleDestinationMarkerCount: number } } }).__spaceWarGame;
            return g?.getTestState()?.visibleDestinationMarkerCount ?? 0;
          });
          return state;
        },
        { timeout: 2000 },
      )
      .toBeGreaterThanOrEqual(1);
  });
});

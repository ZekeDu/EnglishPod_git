import { test, expect } from '@playwright/test';

test('缓存本课并在离线模式下可从 Cache 命中资源', async ({ page, context }) => {
  await page.goto('/lesson/1');
  const cacheBtn = page.getByRole('button', { name: /缓存本课用于离线|已缓存/ });
  await cacheBtn.click();
  // wait until button shows 已缓存
  await expect(page.getByRole('button', { name: '已缓存' })).toBeVisible({ timeout: 5000 });

  // switch offline
  await context.setOffline(true);
  // verify Cache contains audio
  const matched = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const name = cacheNames.find(n => n.startsWith('ep365-lesson-cache-v1'));
    if (!name) return false;
    const c = await caches.open(name);
    const res = await c.match('/audio/1_main.mp3', { ignoreSearch: true });
    return !!res;
  });
  expect(matched).toBeTruthy();
  // restore online for cleanup
  await context.setOffline(false);
});


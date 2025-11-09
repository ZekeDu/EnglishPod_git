import { test, expect } from '@playwright/test';

test('首页加载课程并可进入详情', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('English Pod 365')).toBeVisible();
  // 点击第一个课程卡片
  const firstLink = page.locator('a.card').first();
  await expect(firstLink).toBeVisible();
  await firstLink.click();
  // 到详情页，标题可见
  const heading = page.locator('h1.app-title');
  await expect(heading).toBeVisible();
});

test('详情页显示字幕并可点击设置当前句', async ({ page }) => {
  await page.goto('/lesson/1');
  await expect(page.getByText('当前句')).toBeVisible();
  // 点击第一条字幕（Hello!）
  const firstItem = page.locator('ul >> li').first();
  await firstItem.click();
  const currentP = page.locator('h3:has-text("当前句") + p');
  await expect(currentP).not.toHaveText('(未选择)');
});

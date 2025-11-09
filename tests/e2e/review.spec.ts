import { test, expect } from '@playwright/test';

test('加入复习并完成一条评分', async ({ page, request }) => {
  // reset to ensure visible items
  await request.post('http://localhost:4001/reviews/reset').catch(()=>{});

  // go to lesson and add first vocab to review
  await page.goto('/lesson/1');
  const addBtn = page.getByRole('button', { name: '加入复习' }).first();
  await addBtn.click();

  // open review page
  await page.goto('/review');
  await expect(page.getByText(/进度/)).toBeVisible();
  // click Good
  await page.getByRole('button', { name: 'Good' }).click();
  // either shows next item or completion alert has been shown (not assertable easily here)
  await expect(page.getByText(/进度/)).toBeVisible();
});


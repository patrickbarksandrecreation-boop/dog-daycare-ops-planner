import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function demo(page:Page) {
  await page.goto('/'); await page.getByLabel('Demo scenario').selectOption('planned');
  await page.getByRole('button',{name:'Explore the demo'}).click();
  await expect(page.getByTestId('booked-count')).toHaveText('100');
}
async function info(page:Page) { await page.getByRole('button',{name:'Information for Alfie',exact:true}).click(); }
test('popup saves colours across tabs, reload, moves and dates; cancel and white reset work',async({page,context})=>{
  await demo(page); await info(page);
  await page.getByRole('button',{name:'Pink card colour',exact:true}).click();
  await page.getByRole('button',{name:'Cancel colour change'}).click();
  await expect(page.getByRole('button',{name:'White card colour'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Blue card colour'}).click();
  await page.getByRole('button',{name:'Save colour',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Card colour saved.'})).toBeVisible();
  await page.getByLabel('Move dog to').selectOption('');
  await page.getByRole('button',{name:'Close dialog'}).click();
  await expect(page.getByTestId('card-Alfie')).toHaveCSS('background-color','rgb(207, 229, 250)');
  const other=await context.newPage(); await demo(other); await info(other);
  await expect(other.getByRole('button',{name:'Blue card colour'})).toHaveAttribute('aria-pressed','true');
  await info(page); await page.getByRole('button',{name:'Pink card colour'}).click();
  await other.getByLabel('Custom card colour').fill('#000000');
  await other.getByRole('button',{name:'Save colour',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'saved colour changed'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Save colour',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Cancel colour change'}).click();
  await page.getByRole('button',{name:'Close dialog'}).click();
  await expect(page.getByTestId('card-Alfie')).toHaveCSS('color','rgb(255, 255, 255)');
  await page.reload(); await demo(page); await info(page);
  await expect(page.getByLabel('Custom card colour')).toHaveValue('#000000');
  await context.setOffline(true); await expect(page.getByLabel('Custom card colour')).toBeDisabled();
  await context.setOffline(false); await expect(page.getByLabel('Custom card colour')).toBeEnabled();
  await page.getByRole('button',{name:'White card colour'}).click();
  await page.getByRole('button',{name:'Save colour',exact:true}).click();
  await page.getByRole('button',{name:'Close dialog'}).click();
  await expect(page.getByTestId('card-Alfie')).toHaveCSS('background-color','rgb(255, 255, 255)');
});
test('colour controls fit a phone and keep the selected card colour visible',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await demo(page); await info(page);
  await page.getByRole('button',{name:'Purple card colour'}).click();
  await page.screenshot({path:'docs/screenshots/dog-colour-mobile.png'});
  await page.getByRole('button',{name:'Save colour',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Card colour saved.'})).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Select Alfie',exact:true}).click();
  await expect(page.getByTestId('card-Alfie')).toHaveCSS('background-color','rgb(227, 215, 245)');
});

import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
async function open(page: import('@playwright/test').Page, scenario='planned') {
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/'); await page.getByLabel('Demo scenario').selectOption(scenario);
  await page.getByRole('button',{name:'Explore the demo'}).click();
  await expect(page.getByTestId('booked-count')).toHaveText('100');
}
const geometry = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const panels=[...document.querySelectorAll<HTMLElement>('[data-panel-id]')];
  return panels.map(p=>{const r=p.getBoundingClientRect(); const cards=[...p.querySelectorAll('.dog-card')].map(c=>c.getBoundingClientRect()); const grid=p.querySelector('.group-grid,.unassigned-cards')!;
    return {id:p.dataset.panelId,width:r.width,left:r.left,right:r.right,height:r.height,bottom:r.bottom,columns:new Set(cards.map(c=>Math.round(c.left))).size,allInside:cards.every(c=>c.bottom<=r.bottom&&c.left>=r.left&&c.right<=r.right),overflow:getComputedStyle(grid).overflowY};});
});
test('desktop pointer resizing redistributes space, wraps cards and retains every dog',async({page})=>{
  await open(page);
  const before=await geometry(page);
  const handle=page.getByRole('button',{name:'Resize width of Group 1',exact:true});
  const box=(await handle.boundingBox())!;
  await page.mouse.move(box.x+10,box.y+10); await page.mouse.down();
  await page.mouse.move(box.x+340,box.y+10,{steps:12}); await page.mouse.up();
  const after=await geometry(page);
  expect(after[1].width).toBeGreaterThan(before[1].width+250);
  expect(after[1].columns).toBeGreaterThan(before[1].columns);
  for(const i of [0,2,3]) expect(after[i].width).toBeLessThan(before[i].width);
  for(let i=1;i<after.length;i++) expect(after[i].left).toBeGreaterThanOrEqual(after[i-1].right);
  expect(after.every(p=>p.allInside&&p.overflow==='visible')).toBe(true);
  expect(await page.locator('.dog-card').count()).toBe(100);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await mkdir('docs/screenshots',{recursive:true});
  await page.screenshot({path:'docs/screenshots/resizable-desktop.png',fullPage:true});
});
test('Unassigned grows downwards and page scrolling exposes every booking',async({page})=>{
  await open(page,'morning');
  const before=(await geometry(page))[0];
  expect(before.allInside).toBe(true); expect(before.height).toBeGreaterThan(2000);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(true);
  const handle=page.getByRole('button',{name:'Resize width of Unassigned',exact:true});
  await handle.focus(); await page.keyboard.press('ArrowRight');
  expect((await geometry(page))[0].width).toBeGreaterThan(before.width);
  await page.getByLabel('Search unassigned dogs').fill('Alfie');
  const small=(await geometry(page))[0];
  expect(small.height).toBeLessThan(before.height);
  await page.getByLabel('Search unassigned dogs').fill('');
  expect((await geometry(page))[0].height).toBeGreaterThan(small.height);
  await page.getByTestId('lane-unassigned').locator('.dog-card').last().scrollIntoViewIfNeeded();
  await expect(page.getByTestId('lane-unassigned').locator('.dog-card').last()).toBeVisible();
  expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(0);
});
test('vertical resizing sets a floor while additional dogs automatically extend a group',async({page})=>{
  await open(page,'morning');
  const handle=page.getByRole('button',{name:'Resize Group 1',exact:true});
  const initial=(await geometry(page))[1].height;
  await handle.focus(); await page.keyboard.press('ArrowDown');
  expect((await geometry(page))[1].height).toBeGreaterThanOrEqual(initial+31);
  for(const name of ['Alfie','Archie','Bella','Biscuit','Bonnie','Charlie','Cleo','Daisy','Finn','Frankie']) {
    await page.getByRole('button',{name:'Select '+name,exact:true}).click();
    await page.getByRole('button',{name:'Move selected dog to Group 1',exact:true}).click();
  }
  const group=(await geometry(page))[1]; expect(group.height).toBeGreaterThan(initial+32); expect(group.allInside).toBe(true);
  await expect(page.getByTestId('present-count')).toHaveText('0');
});
test('desktop resize preferences do not affect mobile tabs and horizontal strip',async({page})=>{
  await open(page);
  await page.getByRole('button',{name:'Resize Group 1',exact:true}).focus(); await page.keyboard.press('ArrowRight');
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.panel-resize:visible')).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Group views and destinations'})).toBeVisible();
  expect(await page.getByTestId('lane-unassigned').evaluate(p=>getComputedStyle(p.querySelector('.unassigned-cards')!).gridAutoFlow)).toBe('column');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Select Archie',exact:true}).click();
  await page.getByRole('button',{name:'Send selected dog to Group 2',exact:true}).click();
  await expect(page.getByTestId('lane-group-2').getByTestId('card-Archie')).toBeVisible();
});

test('extreme resizing and smaller desktop windows preserve bounds and card placements',async({page})=>{
  await open(page,'four');
  const handle=page.getByRole('button',{name:'Resize width of Group 1',exact:true});
  await handle.focus();
  for(let i=0;i<35;i++) await page.keyboard.press('ArrowRight');
  for(const width of [1920,1100,900,761]) {
    await page.setViewportSize({width,height:1080});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const panels=await geometry(page); expect(panels.every(p=>p.allInside)).toBe(true);
    for(let i=1;i<panels.length;i++) expect(panels[i].left).toBeGreaterThanOrEqual(panels[i-1].right);
    await expect(page.locator('.dog-card')).toHaveCount(100);
  }
});

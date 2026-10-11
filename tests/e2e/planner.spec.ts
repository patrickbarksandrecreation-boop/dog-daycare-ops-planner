import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
async function demo(page: Page, scenario='planned') {
  await page.goto('/');
  await page.getByLabel('Demo scenario').selectOption(scenario);
  await page.getByRole('button',{name:'Explore the demo'}).click();
  await expect(page.getByTestId('booked-count')).toHaveText('100');
}
async function move(page: Page, name: string, group: string) {
  await page.getByRole('button',{name:`Select ${name}`,exact:true}).click();
  await page.getByRole('button',{name:`Move selected dog to ${group}`,exact:true}).click();
}
async function drag(page: Page, name: string, target: Locator) {
  await expect(page.getByRole('button',{name:`Drag ${name}`,exact:true})).toBeEnabled();
  await page.getByRole('button',{name:`Drag ${name}`,exact:true}).click({trial:true});
  await page.getByRole('button',{name:`Drag ${name}`,exact:true}).scrollIntoViewIfNeeded();
  const from=await page.getByRole('button',{name:`Drag ${name}`,exact:true}).boundingBox();
  const to=await target.boundingBox();
  await page.mouse.move(from!.x+from!.width/2,from!.y+from!.height/2); await page.mouse.down();
  await page.mouse.move(from!.x+12,from!.y+10,{steps:4});
  await expect(page.locator('.dog-card.dragging')).toHaveCount(1);
  await page.mouse.move(to!.x+to!.width/2,to!.y+to!.height/2,{steps:18}); await page.mouse.up();
}
test('morning bookings and separate searches preserve unique placements', async ({page}) => {
  await demo(page,'morning');
  await expect(page.getByTestId('expected-count')).toHaveText('100');
  await page.getByLabel('Search unassigned dogs').fill('Alfie');
  await expect(page.getByTestId('lane-unassigned').locator('.dog-card')).toHaveCount(5);
  await move(page,'Alfie','Group 1');
  await expect(page.getByTestId('lane-group-1').getByTestId('card-Alfie')).toBeVisible();
  await expect(page.getByTestId('lane-unassigned').getByTestId('card-Alfie')).toHaveCount(0);
  await expect(page.getByTestId('present-count')).toHaveText('0');
  await page.getByRole('button',{name:'Dog database',exact:true}).click();
  await page.getByLabel('Search dog database').fill('Alfie');
  await expect(page.getByRole('button',{name:'Alfie already booked',exact:true})).toBeDisabled();
  await expect(page.locator('.database-row')).toHaveCount(6);
  await page.getByRole('button',{name:'Close dialog'}).click();
  await expect(page.getByTestId('booked-count')).toHaveText('100');
});
test('selection, deselection, arrival and movement remain independent', async ({page}) => {
  await demo(page);
  const select=page.getByRole('button',{name:'Select Archie',exact:true});
  await select.click(); await expect(select).toHaveAttribute('aria-pressed','true');
  await select.click(); await expect(select).toHaveAttribute('aria-pressed','false');
  await select.click(); await page.keyboard.press('Escape');
  await expect(select).toHaveAttribute('aria-pressed','false');
  await select.focus(); await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Move selected dog to Group 2',exact:true}).press('Enter');
  await expect(page.getByTestId('lane-group-2').getByTestId('card-Archie')).toBeVisible();
  await expect(page.getByTestId('present-count')).toHaveText('31');
  await page.getByRole('button',{name:'Mark Archie present',exact:true}).click();
  await expect(page.getByTestId('present-count')).toHaveText('32');
  await move(page,'Archie','Group 3');
  await expect(page.getByTestId('card-Archie')).toHaveClass(/present/);
  await move(page,'Archie','Unassigned');
  await expect(page.getByTestId('lane-unassigned').getByTestId('card-Archie')).toBeVisible();
  await expect(page.getByTestId('present-count')).toHaveText('32');
});
test('warnings distinguish planned and present conflict and remove departed dogs', async ({page}) => {
  await demo(page);
  await expect(page.getByTestId('warnings-group-1')).toContainText('1 planned conflict');
  await expect(page.getByTestId('warnings-group-2')).toContainText('1 present conflict');
  await page.getByRole('button',{name:'Mark Archie present',exact:true}).click();
  await expect(page.getByTestId('warnings-group-1')).toContainText('1 present conflict');
  await page.getByRole('button',{name:'Information for Archie',exact:true}).click();
  await page.getByRole('button',{name:'Mark departed',exact:true}).click();
  await expect(page.getByTestId('card-Archie')).toHaveCount(0);
  await expect(page.getByTestId('warnings-group-1')).not.toContainText('conflict');
  await expect(page.getByTestId('counts-group-1')).toHaveText('10 present / 29 planned');
  await expect(page.getByTestId('booked-count')).toHaveText('100');
  await expect(page.getByTestId('departed-count')).toHaveText('1');
  await page.getByRole('button',{name:'Day records',exact:true}).click();
  await page.getByRole('button',{name:'Archie Group 1 departed',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Departed:');
  await page.getByRole('button',{name:'Undo departure'}).click();
  await expect(page.getByTestId('card-Archie')).toHaveClass(/present/);
  await expect(page.getByTestId('warnings-group-1')).toContainText('1 present conflict');
});
test('pointer drag supports all destinations and grid reorder', async ({page}) => {
  await demo(page,'morning');
  await page.getByLabel('Search unassigned dogs').fill('Alfie');
  await drag(page,'Alfie',page.getByTestId('lane-group-1').locator('.group-heading'));
  await expect(page.getByTestId('lane-group-1').getByTestId('card-Alfie')).toBeVisible();
  await drag(page,'Alfie',page.getByTestId('lane-group-2').locator('.group-heading'));
  await expect(page.getByTestId('lane-group-2').getByTestId('card-Alfie')).toBeVisible();
  await drag(page,'Alfie',page.getByTestId('lane-unassigned').locator('.unassigned-heading'));
  await expect(page.getByTestId('lane-unassigned').getByTestId('card-Alfie')).toBeVisible();
  await page.getByRole('button',{name:'Exit demo'}).click(); await demo(page);
  await drag(page,'Alfie',page.getByTestId('card-Archie'));
  await expect(page.getByTestId('lane-group-1').locator('.dog-card').nth(1)).toHaveAttribute('data-dog-id','demo-0');
  await expect(page.getByTestId('booked-count')).toHaveText('100');
});
test('quick creation warns on duplicates, supports photos and makes new dogs bookable', async ({page}) => {
  await demo(page);
  await page.getByRole('button',{name:'New Dog',exact:true}).click();
  await page.getByLabel('Dog’s name').fill('Luna');
  await expect(page.getByRole('button',{name:'Save dog',exact:true})).toBeDisabled();
  await page.getByLabel('This is a different dog with the same name').check();
  await page.getByLabel('Photo (optional)').setInputFiles('public/icon-192.png');
  await page.getByRole('button',{name:'Save dog',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Dog database');
  const row=page.locator('.database-row').filter({has:page.locator('img')});
  await row.getByRole('button',{name:'Book Luna for day',exact:true}).click();
  await expect(page.getByTestId('booked-count')).toHaveText('101');
  await row.getByRole('button',{name:'Edit Luna',exact:true}).click();
  await page.getByLabel('Dog’s name').fill('Luna Rose');
  await page.getByLabel('Archive this dog').check();
  await page.getByRole('button',{name:'Save dog',exact:true}).click();
  await page.getByLabel('Search unassigned dogs').fill('Luna Rose');
  await expect(page.getByTestId('card-Luna Rose')).toBeVisible();
  await page.getByRole('button',{name:'Information for Luna Rose'}).click();
  await expect(page.getByRole('dialog')).toContainText('Archived record');
});
test('inline labels, date restoration and safe clear retain attendance history', async ({page}) => {
  await demo(page);
  await page.getByRole('button',{name:'Rename Group 1'}).click();
  await page.getByLabel('Group name').fill('Gentle souls');
  await page.getByLabel('Also use for newly opened days').check();
  await page.getByRole('button',{name:'Save name'}).click();
  await page.getByLabel('Planning date').fill('2030-01-01');
  await expect(page.getByTestId('booked-count')).toHaveText('0');
  await expect(page.getByTestId('lane-group-1')).toContainText('Gentle souls');
  await page.getByRole('button',{name:'Today',exact:true}).click();
  await expect(page.getByTestId('booked-count')).toHaveText('100');
  await page.getByRole('button',{name:'Clear expected bookings',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Keep plan'}).click();
  await expect(page.getByTestId('booked-count')).toHaveText('100');
  await page.getByRole('button',{name:'Clear expected bookings',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Clear expected bookings'}).click();
  await expect(page.getByTestId('expected-count')).toHaveText('0');
  await expect(page.getByTestId('present-count')).toHaveText('31');
  await expect(page.getByTestId('booked-count')).toHaveText('31');
});
test('right-click and double-click show the same dog information', async ({page}) => {
  await demo(page);
  await page.getByRole('button',{name:'Select Alfie',exact:true}).click({button:'right'});
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Alfie');
  await expect(page.getByRole('dialog')).toContainText('quiet greeting');
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Select Archie',exact:true}).dblclick();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Archie');
});
test('offline view preserves cards and disables attendance and allocation', async ({page,context}) => {
  await demo(page);
  await context.setOffline(true);
  await expect(page.locator('.connection')).toContainText('Offline');
  await expect(page.getByTestId('card-Archie')).toBeVisible();
  await expect(page.getByRole('button',{name:'Select Archie',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Mark Archie present',exact:true})).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByRole('button',{name:'Select Archie',exact:true})).toBeEnabled();
});
test('1920×1080 density shows at least 70 complete group cards at normal zoom', async ({page}) => {
  await page.setViewportSize({width:1920,height:1080}); await demo(page);
  const measure=await page.evaluate(()=>{
    const visible=[...document.querySelectorAll('.group-grid .dog-card')].filter(card=>{
      const r=card.getBoundingClientRect(), lane=card.closest('.group-grid')!.getBoundingClientRect();
      return r.top>=lane.top && r.bottom<=Math.min(lane.bottom,innerHeight) && r.left>=0 && r.right<=innerWidth;
    });
    return {visible:visible.length,zoom:visualViewport!.scale,overflow:document.documentElement.scrollWidth>innerWidth,font:parseFloat(getComputedStyle(document.querySelector('.dog-name')!).fontSize)};
  });
  expect(measure.visible).toBeGreaterThanOrEqual(70); expect(measure.zoom).toBe(1);
  expect(measure.overflow).toBe(false); expect(measure.font).toBeGreaterThanOrEqual(13);
  await mkdir('docs/screenshots',{recursive:true});
  await page.screenshot({path:'docs/screenshots/desktop-1920.png'});
  console.log('Density measurement:',JSON.stringify(measure));
});
test('fourth group renders from data and receives selected dogs', async ({page}) => {
  await page.setViewportSize({width:1920,height:1080}); await demo(page,'four');
  await expect(page.locator('.group-lane')).toHaveCount(4);
  await move(page,'Archie','Group 4');
  await expect(page.getByTestId('lane-group-4').getByTestId('card-Archie')).toBeVisible();
});
test('390px touch supports tap moves, stationary hold and grip drag without conflict', async ({browser}) => {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try {
    await demo(page);
    await page.getByRole('button',{name:'Select Archie',exact:true}).tap();
    await page.getByRole('button',{name:'Send selected dog to Group 2',exact:true}).tap();
    await expect(page.getByTestId('lane-group-2').getByTestId('card-Archie')).toHaveCount(1);
    await page.getByRole('button',{name:'View Group 1',exact:true}).tap();
    const cdp=await context.newCDPSession(page);
    const touch=async (type: 'touchStart'|'touchMove'|'touchEnd',x=0,y=0) =>
      cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
    const select=page.getByRole('button',{name:'Select Alfie',exact:true});
    await select.scrollIntoViewIfNeeded();
    let box=(await select.boundingBox())!;
    await touch('touchStart',box.x+40,box.y+20);
    await page.waitForTimeout(650); // Exercise the real stationary-hold threshold.
    await touch('touchEnd');
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Alfie');
    await page.getByRole('button',{name:'Close dialog'}).tap();
    await expect(select).toHaveAttribute('aria-pressed','false');
    // Sliding a card's body cancels the hold and permits ordinary scrolling.
    await select.scrollIntoViewIfNeeded(); box=(await select.boundingBox())!;
    await touch('touchStart',box.x+40,box.y+20);
    await touch('touchMove',box.x+40,box.y-20);
    await page.waitForTimeout(650);
    await touch('touchEnd');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The separate grip can be dragged and held without opening information.
    const grip=page.getByRole('button',{name:'Drag Alfie',exact:true});
    await grip.scrollIntoViewIfNeeded(); const from=(await grip.boundingBox())!;
    const to=(await page.getByRole('button',{name:'View Group 3',exact:true}).boundingBox())!;
    await touch('touchStart',from.x+from.width/2,from.y+20);
    await touch('touchMove',from.x+15,from.y+30);
    await page.waitForTimeout(650);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await touch('touchMove',to.x+to.width/2,to.y+to.height/2);
    await touch('touchEnd');
    await expect(page.getByTestId('lane-group-3').getByTestId('card-Alfie')).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'View Group 1',exact:true}).tap();
    await page.evaluate(()=>window.scrollTo(0,0));
    await expect(page.locator('.drag-preview')).toHaveCount(0);
    await mkdir('docs/screenshots',{recursive:true});
    await page.screenshot({path:'docs/screenshots/mobile-390.png'});
  } finally { await context.close(); }
});

test('dog markers and group runs show and clear contextual water park warnings',async({page})=>{
  await demo(page,'morning');
  await page.getByRole('button',{name:'Information for Alfie',exact:true}).click();
  await page.getByRole('button',{name:'Groomed/bathed',exact:true}).click();
  await expect(page.getByRole('button',{name:'Groomed/bathed',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'No water park',exact:true}).click();
  await expect(page.getByRole('button',{name:'No water park',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('card-Alfie').getByLabel('Groomed/bathed')).toBeVisible();
  await expect(page.getByTestId('card-Alfie').getByLabel('No water park')).toBeVisible();
  await page.getByLabel('Run for Group 1',{exact:true}).selectOption('Water park');
  await move(page,'Alfie','Group 1');
  await expect(page.getByTestId('warnings-group-1')).toContainText('1 planned conflict');
  await page.getByRole('button',{name:'View warnings for Group 1',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Owner requested no water park');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Mark Alfie present',exact:true}).click();
  await expect(page.getByTestId('warnings-group-1')).toContainText('1 present conflict');
  await page.getByLabel('Run for Group 1',{exact:true}).selectOption('Playground');
  await expect(page.getByTestId('warnings-group-1')).not.toContainText('conflict');
  await page.getByLabel('Run for Group 1',{exact:true}).selectOption('Water park');
  await expect(page.getByTestId('warnings-group-1')).toContainText('1 present conflict');
  await page.getByRole('button',{name:'Information for Alfie',exact:true}).click();
  await page.getByRole('button',{name:'Groomed/bathed',exact:true}).click();
  await expect(page.getByRole('button',{name:'Groomed/bathed',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'No water park',exact:true}).click();
  await expect(page.getByRole('button',{name:'No water park',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('warnings-group-1')).not.toContainText('conflict');
});

test('mobile markers can be set from the database and run selection stays usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await demo(page,'planned');
  await page.getByRole('button',{name:'Dog database',exact:true}).click();
  await page.getByLabel('Search dog database').fill('Alfie');
  await page.getByRole('button',{name:'Markers for Alfie',exact:true}).click();
  await page.getByRole('button',{name:'No water park',exact:true}).click();
  await expect(page.getByRole('button',{name:'No water park',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  await page.getByLabel('Run for Group 1',{exact:true}).selectOption('Water park');
  await page.getByRole('button',{name:'View warnings for Group 1',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Alfie: Owner requested no water park');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

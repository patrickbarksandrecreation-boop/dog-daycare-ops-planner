import {test,expect} from '@playwright/test';
const run='11111111-2222-4333-8444-555555555555',code='a'.repeat(64);
const endpoint='**/.netlify/functions/petboost-mobile';
const ready=(revision=1,kind='email')=>({run,status:'ready',revision,business:'Synthetic Enterprise',view:{notice:'form',
  fields:[{id:0,kind,label:kind==='email'?'Email address':kind==='password'?'Password':'Verification code',required:true,maxLength:1024}],buttons:[{id:0,label:'Continue'}]}});
test.use({viewport:{width:390,height:844}});
test('phone completes email, password and verification code; only confirmed worker verification reports success',async({page})=>{
  let step=0,savedReads=0;const commands:any[]=[];
  await page.route(endpoint,async route=>{
    const body=route.request().postDataJSON();expect(route.request().headers().authorization).toBe(`Bearer ${code}`);
    if(body.op==='command'){commands.push(body);step++;return route.fulfill({json:{run,status:'busy',revision:step}});}
    if(body.op==='start')return route.fulfill({json:{run,status:'starting',revision:0}});
    if(step<3)return route.fulfill({json:ready(step+1,['email','password','code'][step])});
    savedReads++;return route.fulfill({json:{run,status:'saved',revision:3,verification:savedReads>1?'verified':'checking'}});
  });
  await page.goto(`/petboost-reconnect.html#code=${code}`);
  expect(page.url()).not.toContain(code);expect(await page.locator('#code').inputValue()).toBe(code);
  await page.getByRole('button',{name:'Start secure login'}).click();
  await page.getByLabel('Email address').fill('synthetic@example.com');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Password', {exact:true}).fill('synthetic-private-password');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Verification code').fill('123456');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('login saved. Checking');
  await expect(page.getByRole('status')).toContainText('saved and verified');
  expect(commands.map(c=>c.command.values[0].value)).toEqual(['synthetic@example.com','synthetic-private-password','123456']);
  expect(commands.map(c=>c.revision)).toEqual([1,2,3]);
  expect(await page.locator('input[type="password"]').evaluateAll(inputs=>inputs.map(el=>(el as HTMLInputElement).value))).not.toContain('synthetic-private-password');
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length,cookies:document.cookie}))).toEqual({local:0,session:0,cookies:''});
});
test('stable polling preserves typed input, stale actions clear secrets and refresh the current form',async({page})=>{
  let reads=0;
  await page.route(endpoint,async route=>{
    const b=route.request().postDataJSON();
    if(b.op==='command')return route.fulfill({status:409,json:{error:'That login step has changed.'}});
    if(b.op==='read')reads++;
    return route.fulfill({json:ready(1,'password')});
  });
  await page.goto('/petboost-reconnect.html');await page.getByLabel('Reconnect code').fill(code);await page.getByRole('button',{name:'Start secure login'}).click();
  await page.getByLabel('Password',{exact:true}).fill('synthetic-private-value');
  await expect.poll(()=>reads).toBeGreaterThanOrEqual(1);
  await expect(page.getByLabel('Password',{exact:true})).toHaveValue('synthetic-private-value');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('step has changed');
  await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
});
test('cancel closes the flow without reporting a saved login',async({page})=>{
  let cancelled=false;
  await page.route(endpoint,async route=>{
    const b=route.request().postDataJSON();if(b.op==='cancel')cancelled=true;
    await route.fulfill({json:cancelled?{run,status:'cancelled',revision:1}:ready()});
  });
  await page.goto(`/petboost-reconnect.html#code=${code}`);await page.getByRole('button',{name:'Start secure login'}).click();
  await page.getByRole('button',{name:'Cancel reconnect'}).click();await expect(page.getByRole('status')).toContainText('not changed');
  expect(cancelled).toBe(true);await expect(page.getByRole('button',{name:'Continue',exact:true})).toHaveCount(0);
});
test('an expired capability stops polling and clears the login fields',async({page})=>{
  let reads=0;
  await page.route(endpoint,async route=>{
    if(route.request().postDataJSON().op==='read'){reads++;return route.fulfill({status:401,json:{error:'Reconnect code expired.'}});}
    await route.fulfill({json:ready(1,'password')});
  });
  await page.goto(`/petboost-reconnect.html#code=${code}`);await page.getByRole('button',{name:'Start secure login'}).click();
  await page.getByLabel('Password',{exact:true}).fill('synthetic-private-value');
  await expect(page.getByRole('status')).toContainText('fresh reconnect code');
  await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);expect(reads).toBe(1);
});
test('lost network and failed hosted checks never become verified; narrow screens keep controls usable',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  let phase='ready';
  await page.route(endpoint,async route=>{
    if(phase==='offline')return route.abort();
    if(phase==='saved')return route.fulfill({json:{run,status:'saved',revision:1,verification:'failed'}});
    await route.fulfill({json:ready()});
  });
  await page.goto(`/petboost-reconnect.html#code=${code}`);await page.getByRole('button',{name:'Start secure login'}).click();
  await expect(page.getByLabel('Email address')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await page.getByRole('button',{name:'Continue',exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  phase='offline';await expect(page.getByRole('alert')).toContainText('Connection interrupted');
  await expect(page.getByRole('status')).not.toContainText('verified');
  phase='saved';await expect(page.getByRole('status')).toContainText('worker check failed');
  await expect(page.getByRole('status')).not.toContainText('saved and verified');
});

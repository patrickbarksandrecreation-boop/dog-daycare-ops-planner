import {extractPetboost} from './ai-extract.mjs';
export class SyncError extends Error {
  constructor(code) {super(code);this.code=code;}
}
export const brisbaneDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit',
}).format(now);
export function scheduledSlot(now=new Date()) {
  const local=new Date(now.getTime()+10*60*60*1000);
  if([0,6].includes(local.getUTCDay())) return null;
  const h=local.getUTCHours(),m=local.getUTCMinutes();
  return h>=6 && h<=11 && m>=30 && m<40
    ? `${brisbaneDate(now)}T${String(h).padStart(2,'0')}:30` : null;
}
const statuses=['Confirmed','In Progress','Complete','Completed','Cancelled','Canceled','No Show','Scheduled','Ready to Pay','Paid','Checked In','Arrived'];
const validId=value=>/^[a-f0-9]{24}$/.test(value||'');
async function checkLogin(page) {
  if(new URL(page.url()).hostname!=='business.petboost.com'
    || await page.getByRole('heading',{name:'Login to Petboost Business',exact:true}).count())
    throw new SyncError('login_required');
}
async function navigate(page,path) {
  await page.goto(`https://business.petboost.com/${path}`,{waitUntil:'domcontentloaded',timeout:30000});
  await checkLogin(page);
}
async function assertBusiness(page,business) {
  const menu=page.getByRole('button',{name:'Open menu',exact:true});
  const button=page.getByRole('button',{name:business,exact:true});
  await menu.or(button).first().waitFor({timeout:30000});
  if(!await button.isVisible()) await menu.click();
  await button.waitFor({timeout:10000});
}
async function readDate(page,now,overview=false) {
  const input=overview?page.getByRole('textbox',{name:'Select date',exact:true}):
    page.getByRole('textbox',{name:/^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4}$/});
  await input.waitFor({timeout:30000});
  const value=await input.inputValue();
  const parsed=new Date(`${value.replace(',','')} 12:00:00 GMT+1000`);
  if(!Number.isFinite(parsed.getTime()) || brisbaneDate(parsed)!==brisbaneDate(now))
    throw new SyncError('incomplete_fetch');
  return brisbaneDate(parsed);
}
// Copy only bounded rendered booking fields. Terra performs reconciliation;
// no private endpoints or per-appointment reader remain.
export async function readCalendar(page,{now=new Date(),business,onStep=()=>{}}={}) {
  onStep('calendar navigation');await navigate(page,'appointments');
  if(business) await assertBusiness(page,business);
  onStep('calendar date');
  const input=page.getByRole('textbox',{name:/^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4}$/});
  await input.waitFor({timeout:30000});
  const today=page.getByRole('button',{name:'Today',exact:true});
  if(await today.isVisible()) await today.click();
  await page.getByRole('heading',{name:"Today's Appointments",exact:true}).waitFor({timeout:30000});
  const date=await readDate(page,now);
  onStep('calendar total');
  const all=page.getByRole('button',{name:/^Show All \d+$/});
  const empty=page.getByText('No appointments this day',{exact:true});
  await all.or(empty).first().waitFor({timeout:30000});
  let expectedCount=0;
  if(await all.isVisible()) {
    expectedCount=Number((await all.innerText()).match(/\d+/)?.[0]);
    await all.click();
    if(expectedCount>0) await page.locator('[data-scheduler-card]').first().waitFor({timeout:30000});
  } else if(!await empty.isVisible()) throw new SyncError('incomplete_fetch');
  const rows=await page.locator('[data-scheduler-card]').evaluateAll((els,statuses)=>els.map(el=>({
    bookingIds:(el.getAttribute('data-appointment-ids')||'').split(','),
    name:el.querySelector('h3')?.textContent?.trim(),
    service:el.querySelector('p')?.textContent?.trim(),
    status:Array.from(el.querySelectorAll('span,div')).map(n=>n.textContent?.trim()).find(t=>statuses.includes(t)),
  })),statuses);
  if(!Number.isInteger(expectedCount) || expectedCount>1000 || rows.length!==expectedCount
    || rows.some(r=>!r.name || r.name.length>80 || !r.service || !r.status || r.bookingIds.some(x=>!validId(x))))
    throw new SyncError('incomplete_fetch');
  return {date,expectedCount,rows};
}
export async function readOverview(page,{now=new Date(),business,onStep=()=>{}}={}) {
  onStep('overview navigation');await navigate(page,'mission-control');
  if(business) await assertBusiness(page,business);
  const date=await readDate(page,now,true);
  // A loaded date field alone cannot establish an empty day.
  await page.locator('[data-scroll-card]').first().or(page.getByText('No appointments this day',{exact:true})).waitFor({timeout:30000});
  const rows=await page.locator('[data-scroll-card]').evaluateAll((els,statuses)=>els.map(el=>({
    bookingId:el.getAttribute('data-scroll-card'),
    pets:Array.from(el.querySelectorAll('h3 a[href^="/customers-and-pets/"]')).map(a=>({
      petId:a.getAttribute('href')?.split('/')[2]?.split('?')[0],name:a.textContent?.trim(),
    })),
    service:el.querySelector('p')?.textContent?.trim(),
    status:Array.from(el.querySelectorAll('span,div')).map(n=>n.textContent?.trim()).find(t=>statuses.includes(t)),
  })),statuses);
  if(rows.length>1000 || rows.some(r=>!validId(r.bookingId) || !r.service || !r.status
    || r.pets.some(p=>!validId(p.petId) || !p.name))) throw new SyncError('incomplete_fetch');
  return {date,rows};
}
const fingerprint=source=>JSON.stringify({
  calendar:{...source.calendar,rows:source.calendar.rows.map(r=>JSON.stringify(r)).sort()},
  overview:{...source.overview,rows:source.overview.rows.map(r=>JSON.stringify(r)).sort()},
});
export async function readPetboost(page,business,{
  env=process.env,fetcher=fetch,signal,onStep=()=>{},clock=()=>new Date(),
  collectCalendar=readCalendar,collectOverview=readOverview,extract=extractPetboost,
}={}) {
  if(!env.OPENAI_API_KEY) throw new SyncError('ai_unavailable');
  const now=clock();
  try {
    const collect=async()=>({
      business,date:brisbaneDate(now),
      calendar:await collectCalendar(page,{now,business,onStep}),
      overview:await collectOverview(page,{now,business,onStep}),
    });
    const source=await collect();
    if(source.calendar.date!==source.date || source.overview.date!==source.date) throw new SyncError('incomplete_fetch');
    onStep('AI reconciliation');
    const bookings=await extract(source,{env,fetcher,signal});
    signal?.throwIfAborted();
    onStep('source recheck');
    if(fingerprint(await collect())!==fingerprint(source) || brisbaneDate(clock())!==source.date)
      throw new SyncError('incomplete_fetch');
    signal?.throwIfAborted();
    return {date:source.date,complete:true,expectedCount:source.calendar.expectedCount,
      observedCount:source.calendar.rows.length,fetchedAt:clock().toISOString(),
      readerVersion:2,model:'gpt-6.1-terra',reasoning:'low',bookings};
  } catch(error) {
    await checkLogin(page);
    if(['incomplete_fetch','identity_review','ai_unavailable','login_required'].includes(error.code)) throw error;
    throw new SyncError('incomplete_fetch');
  }
}

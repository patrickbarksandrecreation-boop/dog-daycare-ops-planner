// No private API endpoints, passwords, cookies, or source-record mutations.
export class SyncError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export const brisbaneDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit',
}).format(now);
export function scheduledSlot(now = new Date()) {
  const local = new Date(now.getTime() + 10*60*60*1000);
  if ([0,6].includes(local.getUTCDay())) return null;
  const h=local.getUTCHours(), m=local.getUTCMinutes();
  // Each slot has a ten-minute catch-up window; no previous-day replay.
  return h>=6 && h<=11 && m>=30 && m<40
    ? `${brisbaneDate(now)}T${String(h).padStart(2,'0')}:30` : null;
}
export function validateCalendar({date,expectedCount,events}, now=new Date()) {
  if (date!==brisbaneDate(now) || !Number.isInteger(expectedCount) || expectedCount<0 || expectedCount>1000
    || events.length!==expectedCount) throw new SyncError('incomplete_fetch');
  for (const event of events) {
    if (!/^[a-f0-9]{24}$/.test(event.bookingId) || !event.name || !event.service || !event.fullName
      || !['Confirmed','In Progress','Completed','Cancelled','Canceled','No Show','Scheduled','Ready to Pay'].includes(event.status)
      || brisbaneDate(new Date(event.start))!==date) throw new SyncError('incomplete_fetch');
  }
  return JSON.stringify(events.map(e=>[e.bookingId,e.name,e.service,e.start,e.status]).sort());
}
export function normalizeSnapshot(calendar, details, now=new Date()) {
  validateCalendar(calendar,now);
  const bookings=[]; const keys=new Set();
  for (const event of calendar.events) {
    if (!/^Daycare\s*\|/.test(event.service)) continue;
    if (['Cancelled','Canceled','No Show'].includes(event.status)) continue;
    const pets=details.get(event.bookingId);
    const matches=pets?.filter(p=>p.name.trim()===event.name.trim());
    if (matches?.length!==1 || !/^[a-f0-9]{24}$/.test(matches[0].petId)) throw new SyncError('incomplete_fetch');
    const pet=matches[0], key=`${event.bookingId}:${pet.petId}`;
    if(keys.has(key)) throw new SyncError('incomplete_fetch');
    keys.add(key);
    bookings.push({bookingId:event.bookingId,petId:pet.petId,name:event.fullName.trim()});
  }
  return {date:calendar.date,complete:true,expectedCount:calendar.expectedCount,observedCount:calendar.events.length,
    fetchedAt:now.toISOString(),bookings};
}
async function checkLogin(page) {
  if(new URL(page.url()).hostname!=='business.petboost.com') throw new SyncError('login_required');
  if(await page.getByRole('heading',{name:'Login to Petboost Business',exact:true}).count()) throw new SyncError('login_required');
}
export async function readCalendar(page,onStep=()=>{}) {
  onStep('calendar navigation');
  await page.goto('https://business.petboost.com/appointments',{waitUntil:'domcontentloaded',timeout:30000});
  onStep('calendar date');
  // Petboost can restore a date selected during the interactive sign-in.
  const dateField=page.getByRole('textbox',{name:/^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4}$/});
  await dateField.waitFor({timeout:30000}).catch(async()=>{
    await checkLogin(page); throw new SyncError('incomplete_fetch');
  });
  const today=page.getByRole('button',{name:'Today',exact:true});
  if(await today.isVisible()) await today.click();
  onStep('today heading');
  await page.getByRole('heading',{name:"Today's Appointments",exact:true}).waitFor({timeout:30000}).catch(async()=>{
    await checkLogin(page); throw new SyncError('incomplete_fetch');
  });
  await checkLogin(page);
  onStep('calendar total');
  const all=page.getByRole('button',{name:/^Show All \d+$/});
  const empty=page.getByText('No appointments this day',{exact:true});
  await all.or(empty).first().waitFor({timeout:30000});
  let expectedCount;
  if(await all.isVisible()) {
    await all.click();
    expectedCount=Number((await all.innerText()).match(/\d+/)?.[0]);
  } else {
    // Missing cards alone never establish an empty day.
    if(!await empty.isVisible()) throw new SyncError('incomplete_fetch');
    expectedCount=0;
  }
  // Read DOM-only attributes observed in the real calendar. Unknown markup fails closed.
  const raw=await page.locator('[role="button"][data-id^="Appointment_"]').evaluateAll(els=>els.map(e=>({
    label:e.getAttribute('aria-label'),bookingId:e.getAttribute('data-id')?.replace('Appointment_',''),fullName:e.querySelector('h3')?.textContent,
    status:Array.from(e.querySelectorAll('span')).map(n=>n.textContent?.trim())
      .find(t=>['Confirmed','In Progress','Completed','Cancelled','Canceled','No Show','Scheduled','Ready to Pay'].includes(t)),
  })));
  onStep('calendar validation');
  const dateLabel=await dateField.inputValue();
  const date=brisbaneDate(new Date(`${dateLabel} 12:00:00 GMT+1000`));
  const events=raw.map(row=>{
    const m=row.label?.match(/^(.*?) - (.*?) - ([a-f0-9]{24}) Begin From (.*?) Ends At /);
    if(!m) {
      const course=row.label?.match(/^(.*Course) Begin From (.*?) Ends At /);
      if(!course || row.status!=='Scheduled') throw new SyncError('incomplete_fetch');
      return {name:course[1],service:'Course',bookingId:row.bookingId,start:new Date(course[2]).toISOString(),fullName:course[1],status:row.status};
    }
    return {name:m[1],service:m[2],bookingId:m[3],start:new Date(m[4]).toISOString(),fullName:row.fullName,status:row.status};
  });
  const calendar={date,expectedCount,events}; validateCalendar(calendar); return calendar;
}
async function collectPetboost(page, businessButton,onStep) {
  onStep('account navigation');
  await page.goto('https://business.petboost.com/me',{waitUntil:'domcontentloaded',timeout:30000});
  onStep('account menu');
  const menu=page.getByRole('button',{name:'Open menu',exact:true});
  const business=page.getByRole('button',{name:businessButton,exact:true});
  await menu.or(business).first().waitFor({timeout:30000}).catch(async()=>{
    await checkLogin(page); throw new SyncError('incomplete_fetch');
  });
  await checkLogin(page);
  if(!await business.isVisible()) await menu.click();
  onStep('business identity');
  await business.waitFor({timeout:10000});
  const before=await readCalendar(page,onStep), fingerprint=validateCalendar(before);
  const details=new Map();
  for(const event of before.events.filter(e=>/^Daycare\s*\|/.test(e.service) && !['Cancelled','Canceled','No Show'].includes(e.status))) {
    if(details.has(event.bookingId)) continue;
    onStep('appointment details');
    await page.goto(`https://business.petboost.com/appointments/${event.bookingId}`,{waitUntil:'domcontentloaded',timeout:30000});
    const heading=page.getByRole('heading',{level:1,name:/Appointment$/});
    await heading.waitFor({timeout:15000}).catch(async()=>{await checkLogin(page);throw new SyncError('incomplete_fetch');});
    const pets=await heading.getByRole('link').evaluateAll(els=>els.map(e=>({name:e.textContent?.trim(),href:e.getAttribute('href')})));
    if(!pets.length || pets.some(p=>!/^\/customers-and-pets\/[a-f0-9]{24}\?tab=Overview$/.test(p.href||''))) throw new SyncError('incomplete_fetch');
    details.set(event.bookingId,pets.map(p=>({name:p.name,petId:p.href.split('/')[2].split('?')[0]})));
  }
  // A booking added/removed/changed while collecting invalidates the whole read.
  const after=await readCalendar(page,onStep);
  if(validateCalendar(after)!==fingerprint) throw new SyncError('incomplete_fetch');
  return normalizeSnapshot(after,details);
}
export async function readPetboost(page,businessButton,{onStep=()=>{}}={}) {
  try { return await collectPetboost(page,businessButton,onStep); }
  catch(error) { await checkLogin(page); throw error instanceof SyncError ? error : new SyncError('incomplete_fetch'); }
}

import {test,expect} from '@playwright/test';
// @ts-expect-error server-only ESM
import {readCalendar,readPetboost,brisbaneDate} from '../../scripts/petboost/reader.mjs';
// @ts-expect-error server-only ESM
import {validateExtraction} from '../../scripts/petboost/ai-extract.mjs';
const label=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Brisbane',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date());
const today=brisbaneDate(),booking='a'.repeat(24),pet='b'.repeat(24);
const dateInput=(value=label)=>`<input aria-label="${value}" value="${value.replace(',','')}">`;
const empty='<div>No appointments this day</div>';
const card=`<div data-scheduler-card="true" data-appointment-ids="${booking}" role="button"><h3>Synthetic Dog</h3><span>In Progress</span><p>Daycare | Full Day</p></div>`;

test('collector resets a remembered calendar date and accepts an explicit empty day',async({page})=>{
  await page.route('https://business.petboost.com/appointments',route=>route.fulfill({contentType:'text/html',body:
    `<h1>Sunday's Appointments</h1>${dateInput('Sun, 11 Oct 2026')}<button id="today">Today</button>${empty}
    <script>document.querySelector('#today').onclick=()=>{
      document.querySelector('h1').textContent="Today's Appointments";
      const input=document.querySelector('input');input.setAttribute('aria-label',${JSON.stringify(label)});
      input.value=${JSON.stringify(label.replace(',',''))};document.querySelector('#today').remove();
    };</script>`}));
  await expect(readCalendar(page)).resolves.toEqual({date:today,expectedCount:0,rows:[]});
});
test('collector expands and reconciles the current calendar DOM',async({page})=>{
  await page.route('https://business.petboost.com/appointments',route=>route.fulfill({contentType:'text/html',body:
    `<h1>Today's Appointments</h1>${dateInput()}<button onclick="document.querySelector('#event').hidden=false">Show All 1</button><div id="event" hidden>${card}</div>`}));
  await expect(readCalendar(page)).resolves.toEqual({date:today,expectedCount:1,rows:[{bookingIds:[booking],name:'Synthetic Dog',service:'Daycare | Full Day',status:'In Progress'}]});
});
test('collector rejects an empty marker for a different date',async({page})=>{
  await page.route('https://business.petboost.com/appointments',route=>route.fulfill({contentType:'text/html',body:
    `<h1>Today's Appointments</h1>${dateInput('Sun, 11 Oct 2026')}${empty}`}));
  await expect(readCalendar(page)).rejects.toMatchObject({code:'incomplete_fetch'});
});
test('collector rejects missing cards against a positive total',async({page})=>{
  await page.route('https://business.petboost.com/appointments',route=>route.fulfill({contentType:'text/html',body:
    `<h1>Today's Appointments</h1>${dateInput()}<button>Show All 2</button>${card}`}));
  await expect(readCalendar(page)).rejects.toMatchObject({code:'incomplete_fetch'});
});
for(const mobile of [false,true])test(`AI read verifies business and reconciles both views with ${mobile?'collapsed':'visible'} sidebar`,async({page})=>{
  const sidebar=mobile?'<button onclick="this.outerHTML=\'<button>Synthetic Enterprise</button>\'">Open menu</button>':'<button>Synthetic Enterprise</button>';
  const urls:string[]=[];page.on('request',r=>urls.push(r.url()));
  await page.route('https://business.petboost.com/appointments',route=>route.fulfill({contentType:'text/html',body:
    `${sidebar}<h1>Today's Appointments</h1>${dateInput()}<button>Show All 1</button>${card}`}));
  await page.route('https://business.petboost.com/mission-control',route=>route.fulfill({contentType:'text/html',body:
    `${sidebar}<input aria-label="Select date" value="${label.replace(',','')}"><div data-scroll-card="${booking}"><h3><a href="/customers-and-pets/${pet}">Synthetic</a></h3><p>Daycare | Full Day</p><span>In Progress</span></div>`}));
  let calls=0;
  const extract=async(source:any)=>{calls++;return validateExtraction({complete:true,rows:[{calendarRow:0,overviewRow:0,petId:pet,include:true,arrived:true}]},source);};
  await expect(readPetboost(page,'Synthetic Enterprise',{env:{OPENAI_API_KEY:'synthetic'},extract})).resolves.toMatchObject({date:today,readerVersion:2,bookings:[{petId:pet,bookingId:booking,arrived:true}]});
  expect(calls).toBe(1);expect(urls.filter(x=>x.endsWith('/appointments'))).toHaveLength(2);
  expect(urls.filter(x=>x.endsWith('/mission-control'))).toHaveLength(2);
  expect(urls.some(x=>x.includes(`/appointments/${booking}`))).toBe(false);
});

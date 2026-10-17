import {test,expect} from '@playwright/test';
// @ts-expect-error server-only ESM reader
import {readCalendar,readPetboost,brisbaneDate} from '../../scripts/petboost/reader.mjs';

const label=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Brisbane',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date());
const today=brisbaneDate();
const dateInput=(value=label)=>`<input aria-label="${value}" value="${value.replace(',','')}">`;
const empty='<div>No appointments this day</div>';

test('reader resets a remembered date and accepts the explicit empty-day state',async({page})=>{
  await page.route('https://business.petboost.com/appointments',route=>route.fulfill({contentType:'text/html',body:
    `<h1>Sunday's Appointments</h1>${dateInput('Sun, 11 Oct 2026')}<button id="today">Today</button>${empty}
    <script>document.querySelector('#today').onclick=()=>{
      document.querySelector('h1').textContent="Today's Appointments";
      const input=document.querySelector('input');input.setAttribute('aria-label',${JSON.stringify(label)});
      input.value=${JSON.stringify(label.replace(',',''))};document.querySelector('#today').remove();
    };</script>`}));
  await expect(readCalendar(page)).resolves.toEqual({date:today,expectedCount:0,events:[]});
});

test('reader expands and validates a populated calendar',async({page})=>{
  const id='a'.repeat(24),start=`${today}T06:30:00+10:00`;
  await page.route('https://business.petboost.com/appointments',route=>route.fulfill({contentType:'text/html',body:
    `<h1>Today's Appointments</h1>${dateInput()}<button onclick="document.querySelector('#event').hidden=false">Show All 1</button>
    <div id="event" hidden role="button" data-id="Appointment_${id}" aria-label="Synthetic - Daycare | Full Day - ${id} Begin From ${start} Ends At later"><h3>Synthetic Dog</h3><span>Confirmed</span></div>`}));
  const result=await readCalendar(page);
  expect(result.date).toBe(today);expect(result.expectedCount).toBe(1);
  expect(result.events).toEqual([{bookingId:id,name:'Synthetic',fullName:'Synthetic Dog',service:'Daycare | Full Day',status:'Confirmed',start:new Date(start).toISOString()}]);
});

test('reader rejects an empty marker for the wrong date',async({page})=>{
  await page.route('https://business.petboost.com/appointments',route=>route.fulfill({contentType:'text/html',body:
    `<h1>Today's Appointments</h1>${dateInput('Sun, 11 Oct 2026')}${empty}`}));
  await expect(readCalendar(page)).rejects.toMatchObject({code:'incomplete_fetch'});
});

test('reader rejects a positive total with missing cards',async({page})=>{
  await page.route('https://business.petboost.com/appointments',route=>route.fulfill({contentType:'text/html',body:
    `<h1>Today's Appointments</h1>${dateInput()}<button>Show All 1</button>`}));
  await expect(readCalendar(page)).rejects.toMatchObject({code:'incomplete_fetch'});
});

for(const mobile of [false,true]) test(`reader verifies business identity with ${mobile?'collapsed':'visible'} sidebar`,async({page})=>{
  await page.route('https://business.petboost.com/me',route=>route.fulfill({contentType:'text/html',body:
    mobile?'<button onclick="this.outerHTML=\'<button>Synthetic Enterprise</button>\'">Open menu</button>':'<button>Synthetic Enterprise</button>'}));
  await page.route('https://business.petboost.com/appointments',route=>route.fulfill({contentType:'text/html',body:
    `<h1>Today's Appointments</h1>${dateInput()}${empty}`}));
  await expect(readPetboost(page,'Synthetic Enterprise')).resolves.toMatchObject({date:today,complete:true,expectedCount:0,observedCount:0,bookings:[]});
});



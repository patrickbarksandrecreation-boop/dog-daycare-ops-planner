import { expect,it } from 'vitest';
// The worker is a server-only ESM program; it is never imported by the frontend.
// @ts-expect-error plain Node module
import { brisbaneDate,scheduledSlot,validateCalendar,normalizeSnapshot,readPetboost,calendarStart } from '../scripts/petboost/reader.mjs';
const now=new Date('2026-10-15T22:30:00Z');
const event={bookingId:'a'.repeat(24),name:'Synthetic',fullName:'Synthetic Dog',service:'Daycare | Full Day',status:'Confirmed',start:'2026-10-15T20:30:00Z'};
const calendar={date:'2026-10-16',expectedCount:1,events:[event]};
it('parses observed accessible calendar times and retains completed paid bookings',()=>{
  expect(calendarStart('Friday, October 16, 2026 at 6:30:00 AM GMT+10:00')).toBe(new Date(event.start).toISOString());
  expect(calendarStart('Friday, October 16, 2026 at 12:30:00 PM GMT+10:00')).toBe('2026-10-16T02:30:00.000Z');
  expect(()=>calendarStart('unrecognized')).toThrow('incomplete_fetch');
  for(const status of ['Complete','Paid']) expect(normalizeSnapshot({...calendar,events:[{...event,status}]},new Map([[event.bookingId,[{name:'Synthetic',petId:'b'.repeat(24)}]]]),now).bookings).toHaveLength(1);
});
it('uses Brisbane calendar dates and exactly six weekday slots including UTC previous day',()=>{
  expect(brisbaneDate(new Date('2026-10-15T14:01Z'))).toBe('2026-10-16');
  for(let h=6;h<=11;h++) expect(scheduledSlot(new Date(`2026-10-16T${String(h).padStart(2,'0')}:30:00+10:00`))).toBe(`2026-10-16T${String(h).padStart(2,'0')}:30`);
  for(const date of ['2026-10-17T06:30+10:00','2026-10-18T11:30+10:00','2026-10-16T12:30+10:00','2026-10-16T06:29+10:00','2026-10-16T06:40+10:00']) expect(scheduledSlot(new Date(date))).toBeNull();
});
it('rejects incomplete lists, wrong dates, unknown status, absent identity and duplicate booking-pet rows',()=>{
  expect(()=>validateCalendar({...calendar,expectedCount:2},now)).toThrow('incomplete_fetch');
  expect(()=>validateCalendar({...calendar,date:'2026-10-15'},now)).toThrow('incomplete_fetch');
  expect(()=>validateCalendar({...calendar,events:[{...event,status:'Unknown'}]},now)).toThrow('incomplete_fetch');
  expect(()=>normalizeSnapshot(calendar,new Map(),now)).toThrow('incomplete_fetch');
  expect(()=>normalizeSnapshot({...calendar,expectedCount:2,events:[event,event]},new Map([[event.bookingId,[{name:'Synthetic',petId:'b'.repeat(24)}]]]),now)).toThrow('incomplete_fetch');
});
it('supports multi-pet appointments, filters grooming and cancellations, and proves an explicit zero',()=>{
  const other={...event,name:'Other',fullName:'Other Synthetic'};
  const details=new Map([[event.bookingId,[{name:'Synthetic',petId:'b'.repeat(24)},{name:'Other',petId:'c'.repeat(24)}]]]);
  const c={...calendar,expectedCount:4,events:[event,other,{...event,service:'Groom'},{...event,status:'Cancelled'}]};
  expect(normalizeSnapshot(c,details,now).bookings).toHaveLength(2);
  expect(normalizeSnapshot({...calendar,expectedCount:0,events:[]},new Map(),now).bookings).toEqual([]);
  expect(()=>normalizeSnapshot(calendar,new Map([[event.bookingId,[{name:'Synthetic',petId:'b'.repeat(24)},{name:'Synthetic',petId:'c'.repeat(24)}]]]),now)).toThrow('incomplete_fetch');
});
it('classifies expired sessions as login_required without any credential or booking writes',async()=>{
  let navigations=0;
  const page={goto:async()=>{navigations++;},url:()=> 'https://petboost-business.au.auth0.com/u/login',
    getByRole:()=>({or(){return this;},first(){return this;},waitFor:async()=>{throw Error('timeout');}})};
  await expect(readPetboost(page,'Synthetic Enterprise')).rejects.toMatchObject({code:'login_required'});
  expect(navigations).toBe(1);
});

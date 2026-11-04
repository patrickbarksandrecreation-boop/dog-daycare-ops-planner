import {expect,it,vi} from 'vitest';
// @ts-expect-error server-only ESM
import {brisbaneDate,scheduledSlot,readPetboost} from '../scripts/petboost/reader.mjs';
// @ts-expect-error server-only ESM
import {extractPetboost,validateExtraction} from '../scripts/petboost/ai-extract.mjs';
const now=new Date('2026-11-03T22:30:00Z'),date='2026-11-04';
const id=(s:string)=>s.repeat(24),env={OPENAI_API_KEY:'synthetic-key'};
const pet={name:'Synthetic',petId:id('b')};
const calendarRow={bookingIds:[id('a')],name:'Synthetic Dog',service:'Daycare | Full Day',status:'In Progress'};
const overviewRow={bookingId:id('a'),pets:[pet],service:calendarRow.service,status:calendarRow.status};
const source=()=>({business:'Synthetic Enterprise',date,calendar:{date,expectedCount:1,rows:[calendarRow]},overview:{date,rows:[overviewRow]}});
const decision=(extra={})=>({calendarRow:0,overviewRow:0,petId:pet.petId,include:true,arrived:true,...extra});
const result=(rows=[decision()])=>({complete:true,rows});
const api=(value:any)=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
it('uses the Brisbane date and six weekday slots without previous-day replay',()=>{
  expect(brisbaneDate(new Date('2026-11-03T14:01Z'))).toBe(date);
  for(let h=6;h<=11;h++)expect(scheduledSlot(new Date(`2026-11-04T${String(h).padStart(2,'0')}:30+10:00`))).toBe(`${date}T${String(h).padStart(2,'0')}:30`);
  for(const d of ['2026-11-07T06:30+10:00','2026-11-08T11:30+10:00','2026-11-04T12:30+10:00','2026-11-04T06:40+10:00'])expect(scheduledSlot(new Date(d))).toBeNull();
});
it('always calls exactly Terra low through Responses with strict output and no response storage',async()=>{
  const fetcher=vi.fn(async()=>api(result()));
  expect(await extractPetboost(source(),{env,fetcher})).toEqual([{bookingId:id('a'),petId:id('b'),name:'Synthetic Dog',arrived:true}]);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url,request]=fetcher.mock.calls[0] as any;
  expect(url).toBe('https://api.openai.com/v1/responses');
  const body=JSON.parse(request.body);
  expect(body).toMatchObject({model:'gpt-6.1-terra',reasoning:{effort:'low'},store:false,text:{format:{type:'json_schema',strict:true}}});
  expect(body.input).not.toContain(env.OPENAI_API_KEY);
});
it('rejects model omissions, duplicate decisions, invented IDs and false arrival claims',()=>{
  for(const output of [{complete:false,rows:[decision()]},result([]),result([decision(),decision()]),result([decision({petId:id('c')})]),result([decision({arrived:false})]),result([decision({include:false})])])
    expect(()=>validateExtraction(output,source())).toThrow();
  const s=source();s.calendar.rows[0]={...calendarRow,status:'Paid'};s.overview.rows[0]={...overviewRow,status:'Paid'};
  expect(()=>validateExtraction(result(),s)).toThrow('incomplete_fetch');
  expect(validateExtraction(result([decision({arrived:false})]),s)[0].arrived).toBe(false);
});
it('includes orientation and bus, excludes grooming/courses/cancelled, and never infers arrival from payment or completion',()=>{
  for(const service of ['Orientation Day','Bus | Morning','Daycare | Half Day (AM)']) {
    const s=source();s.calendar.rows[0]={...calendarRow,service};s.overview.rows[0]={...overviewRow,service};
    expect(validateExtraction(result(),s)).toHaveLength(1);
  }
  for(const status of ['Paid','Complete','Completed','Confirmed','Ready to Pay']) {
    const s=source();s.calendar.rows[0]={...calendarRow,status};s.overview.rows[0]={...overviewRow,status};
    expect(validateExtraction(result([decision({arrived:false})]),s)[0].arrived).toBe(false);
  }
  for(const [service,status] of [['Full Groom','In Progress'],['Career Starter Course','Scheduled'],['Daycare | Full Day','Cancelled']]) {
    const s=source();s.calendar.rows[0]={...calendarRow,service,status};s.overview.rows[0]={...overviewRow,service,status};
    expect(validateExtraction(result([decision({overviewRow:null,petId:null,include:false,arrived:false})]),s)).toEqual([]);
  }
});
it('uses booking/profile pairs for multi-pet appointments and deduplicates multiple services for one dog',()=>{
  const s=source();s.overview.rows[0]={...overviewRow,pets:[pet,{name:'Second',petId:id('c')}]};
  s.calendar.rows.push({...calendarRow,name:'Second Dog'});s.calendar.expectedCount=2;
  expect(validateExtraction(result([decision(),decision({calendarRow:1,petId:id('c')})]),s)).toHaveLength(2);
  expect(()=>validateExtraction(result([decision(),decision({calendarRow:1})]),s)).toThrow('identity_review');
  const repeated=source();repeated.calendar.rows.push({...calendarRow,service:'Bus | Morning'});
  repeated.overview.rows.push({...overviewRow,service:'Bus | Morning'});
  expect(validateExtraction(result([decision(),decision({calendarRow:1,overviewRow:1})]),repeated)).toHaveLength(1);
});
it('rejects unresolved source disagreement and explicit-zero fabrication',()=>{
  const s=source();s.overview.rows[0]={...overviewRow,bookingId:id('f')};
  expect(()=>validateExtraction(result(),s)).toThrow('identity_review');
  const empty=source();empty.calendar.rows=[];empty.calendar.expectedCount=0;
  expect(()=>validateExtraction(result([]),empty)).toThrow('incomplete_fetch');
  empty.overview.rows=[];expect(validateExtraction(result([]),empty)).toEqual([]);
});
it('stops on missing API key, HTTP errors, refusals, incomplete and malformed model output with no fallback',async()=>{
  const fetcher=vi.fn();await expect(extractPetboost(source(),{env:{},fetcher})).rejects.toMatchObject({code:'ai_unavailable'});
  expect(fetcher).not.toHaveBeenCalled();
  for(const response of [new Response('private API message',{status:401}),new Response('{}'),new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]})),api('invalid')])
    await expect(extractPetboost(source(),{env,fetcher:async()=>response})).rejects.toThrow();
});
it('rechecks both lists after inference, rejecting source changes and Brisbane midnight',async()=>{
  const page={url:()=> 'https://business.petboost.com/mission-control',getByRole:()=>({count:async()=>0})};
  const collectCalendar=vi.fn(async()=>structuredClone(source().calendar));
  const collectOverview=vi.fn(async()=>structuredClone(source().overview));
  const extract=vi.fn(async()=>validateExtraction(result(),source()));
  const options={env,clock:()=>now,collectCalendar,collectOverview,extract};
  expect(await readPetboost(page,'Synthetic Enterprise',options)).toMatchObject({readerVersion:2,model:'gpt-6.1-terra',reasoning:'low',date,bookings:[{arrived:true}]});
  expect(extract).toHaveBeenCalledOnce();expect(collectCalendar).toHaveBeenCalledTimes(2);expect(collectOverview).toHaveBeenCalledTimes(2);
  collectCalendar.mockResolvedValueOnce(source().calendar).mockResolvedValueOnce({...source().calendar,rows:[{...calendarRow,status:'Complete'}]});
  await expect(readPetboost(page,'Synthetic Enterprise',options)).rejects.toMatchObject({code:'incomplete_fetch'});
  const clock=vi.fn().mockReturnValueOnce(now).mockReturnValue(new Date('2026-11-04T14:00Z'));
  await expect(readPetboost(page,'Synthetic Enterprise',{...options,clock})).rejects.toMatchObject({code:'incomplete_fetch'});
});

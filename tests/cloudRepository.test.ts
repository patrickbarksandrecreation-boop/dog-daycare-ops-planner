import { afterEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudRepository } from '../src/supabase';
function fixture() {
  let user='staff-a';
  const state={day:{id:'day',local_date:'2026-01-01',workspace_id:'workspace'},groups:[{group_id:'group',run_version:1}],assignments:[],rules:[],dogs:[{id:'dog',name:'Synthetic dog',photo_path:'workspace/dog/a.jpg',is_archived:false}]};
  const rpc=vi.fn(async(name:string)=>({data:name==='planning_snapshot'?structuredClone(state):null,error:null as null|{message:string}}));
  const signing=vi.fn(async(paths:string[])=>({data:paths.map(path=>({path,signedUrl:'signed:'+path,error:null})),error:null}));
  const session=vi.fn(async()=>({data:{session:{user:{id:user}}},error:null}));
  const single=vi.fn(async()=>({data:{id:user,role:'staff'},error:null}));
  let callback:(state:string)=>void=()=>{};
  const channel={on:vi.fn().mockReturnThis(),subscribe:vi.fn((fn:(state:string)=>void)=>{callback=fn;return channel;})};
  const db={rpc,auth:{getSession:session,signOut:vi.fn(async()=>({error:null}))},from:()=>({select:()=>({eq:()=>({single})})}),storage:{from:()=>({createSignedUrls:signing})},channel:()=>channel,removeChannel:vi.fn()};
  const repo = cloudRepository(db as unknown as SupabaseClient);
  return {repo, read: async (date:string) => repo.photos!(await repo.snapshot(date)),state,rpc,signing,single,callback:(s:string)=>callback(s),switchUser:()=>{user='staff-b';}};
}
afterEach(()=>{vi.useRealTimers();});
it('sends the entire captured selection through one RPC and never falls back after failure',async()=>{
  const f=fixture();
  const selected=[{id:'a',version:2,group_id:'one'},{id:'b',version:1,group_id:null}];
  await f.repo.moveMany('day',selected,'group');
  expect(f.rpc).toHaveBeenCalledExactlyOnceWith('move_assignments',{p_day:'day',p_assignments:selected,p_group:'group'});
  f.rpc.mockResolvedValueOnce({data:null,error:{message:'A selected dog changed. No selected dogs moved.'}});
  await expect(f.repo.moveMany('day',selected,null)).rejects.toThrow(/No selected dogs moved/);
  expect(f.rpc).toHaveBeenCalledTimes(2);
});
it('saves only colour through the version-checked staff RPC and propagates failures',async()=>{
  const f=fixture();
  await f.repo.saveColour('dog','#cfe5fa',2);
  expect(f.rpc).toHaveBeenCalledWith('set_dog_colour',{p_dog:'dog',p_colour:'#cfe5fa',p_version:2});
  f.rpc.mockResolvedValueOnce({data:null,error:{message:'Card colour changed'}});
  await expect(f.repo.saveColour('dog','#ffffff',2)).rejects.toThrow('Card colour changed');
});
it('returns authoritative state before photo signing and shares in-flight signing',async()=>{
  const f=fixture(); let release!:()=>void;
  f.signing.mockImplementationOnce(async paths=>{
    await new Promise<void>(resolve=>{release=resolve;});
    return {data:paths.map(path=>({path,signedUrl:'signed:'+path,error:null})),error:null};
  });
  const state=await f.repo.snapshot('2026-01-01');
  expect(f.signing).not.toHaveBeenCalled();
  const a=f.repo.photos!(state), b=f.repo.photos!(state);
  await vi.waitFor(()=>expect(f.signing).toHaveBeenCalledTimes(1));
  release(); const [first,second]=await Promise.all([a,b]);
  expect(first.dogs[0].photo_url).toBe(second.dogs[0].photo_url);
  expect(state.dogs[0].photo_url).toBeUndefined();
});
it('does not repopulate photo caches when an old signing request completes after sign-out',async()=>{
  const f=fixture(); let release!:()=>void;
  f.signing.mockImplementationOnce(async paths=>{
    await new Promise<void>(resolve=>{release=resolve;});
    return {data:paths.map(path=>({path,signedUrl:'signed:'+path,error:null})),error:null};
  });
  const state=await f.repo.snapshot('2026-01-01'), pending=f.repo.photos!(state);
  await vi.waitFor(()=>expect(f.signing).toHaveBeenCalledTimes(1));
  await f.repo.signOut(); release();
  expect((await pending).dogs[0].photo_url).toBeUndefined();
  await f.read('2026-01-01'); expect(f.signing).toHaveBeenCalledTimes(2);
});
it('refreshes authorised state each time while preparing a date and signing unchanged photos once',async()=>{
  const f=fixture(); await f.repo.profile();
  const a=await f.read('2026-01-01'); const b=await f.read('2026-01-01');
  expect(f.rpc.mock.calls.map(c=>c[0])).toEqual(['ensure_planning_day','planning_snapshot','planning_snapshot']);
  expect(f.signing).toHaveBeenCalledTimes(1); expect(a.dogs[0].photo_url).toBe(b.dogs[0].photo_url);
  await f.read('2026-01-02'); expect(f.rpc.mock.calls.filter(c=>c[0]==='ensure_planning_day')).toHaveLength(2);
  expect(f.signing).toHaveBeenCalledTimes(1);
});
it('signs only changed paths and renews links before they expire',async()=>{
  vi.useFakeTimers();const f=fixture();await f.read('2026-01-01');
  f.state.dogs[0].photo_path='workspace/dog/new.jpg';await f.read('2026-01-01');
  expect(f.signing.mock.calls[1][0]).toEqual(['workspace/dog/new.jpg']);
  vi.advanceTimersByTime(56*60_000);await f.read('2026-01-01');expect(f.signing).toHaveBeenCalledTimes(3);
});
it('never serves cached roster state after access is denied, and checks current staff permissions on every profile read',async()=>{
  const f=fixture();await f.read('2026-01-01');await f.repo.profile();await f.repo.profile();
  expect(f.single).toHaveBeenCalledTimes(2);
  f.rpc.mockResolvedValueOnce({data:null,error:{message:'Staff access required'}});
  await expect(f.read('2026-01-01')).rejects.toThrow('Staff access required');
});
it('retries a failed date preparation instead of caching its rejection',async()=>{
  const f=fixture();f.rpc.mockResolvedValueOnce({data:null,error:{message:'Network failed'}});
  await expect(f.read('2026-01-01')).rejects.toThrow('Network failed');
  await f.read('2026-01-01');expect(f.rpc.mock.calls.filter(c=>c[0]==='ensure_planning_day')).toHaveLength(2);
});
it('clears session-scoped caches when the identity changes and at sign out',async()=>{
  const f=fixture();await f.read('2026-01-01');f.switchUser();await f.read('2026-01-01');
  expect(f.signing).toHaveBeenCalledTimes(2);await f.repo.signOut();await f.read('2026-01-01');
  expect(f.signing).toHaveBeenCalledTimes(3);
});
it('retries missing photo links instead of permanently caching a signing failure',async()=>{
  const f=fixture();f.signing.mockResolvedValueOnce({data:[],error:null});const a=await f.read('2026-01-01');
  expect(a.dogs[0].photo_url).toBeUndefined();await f.read('2026-01-01');expect(f.signing).toHaveBeenCalledTimes(2);
});
it('reports subscription readiness once without issuing a second duplicate change callback',()=>{
  const f=fixture(),changed=vi.fn(),status=vi.fn();const stop=f.repo.watch('2026-01-01',changed,status);
  f.callback('SUBSCRIBED');expect(status).toHaveBeenCalledWith('online');expect(changed).not.toHaveBeenCalled();stop();
});
it('sends independent expected versions for notes and symmetric rule edits/removals',async()=>{
  const f=fixture();
  await f.repo.saveNotes('dog','Quiet greeting',4);
  expect(f.rpc).toHaveBeenLastCalledWith('set_handling_notes',{p_dog:'dog',p_notes:'Quiet greeting',p_version:4});
  await f.repo.saveRule({dogs:['dog','other'],level:'hard',note:'Separate'});
  expect(f.rpc).toHaveBeenLastCalledWith('save_interaction_rule',{p_id:null,p_dog_a:'dog',p_dog_b:'other',p_level:'hard',p_note:'Separate',p_version:null});
  await f.repo.saveRule({id:'pair',version:2,dogs:['other','dog'],level:'soft',note:'Monitor'});
  expect(f.rpc).toHaveBeenLastCalledWith('save_interaction_rule',{p_id:'pair',p_dog_a:'other',p_dog_b:'dog',p_level:'soft',p_note:'Monitor',p_version:2});
  await f.repo.removeRule('pair',3);
  expect(f.rpc).toHaveBeenLastCalledWith('remove_interaction_rule',{p_id:'pair',p_version:3});
  f.rpc.mockResolvedValueOnce({data:null,error:{message:'Rule changed; review the latest version'}});
  await expect(f.repo.removeRule('pair',2)).rejects.toThrow(/changed/);
});

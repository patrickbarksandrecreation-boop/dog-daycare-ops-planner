import { describe, it, expect } from 'vitest';
import { demoRepository } from '../src/demo';
import { groupConflicts } from '../src/behaviour';
import { todayBrisbane } from '../src/model';

describe('editable fictional handling data and independent rule levels',()=>{
  it('keeps hard/soft independent of all attendance transitions and movement',async()=>{
    const repo=demoRepository('planned'),date=todayBrisbane();
    let s=await repo.snapshot(date);
    const warnings=()=>groupConflicts(s.assignments,s.groups[0].group_id,s.rules);
    expect(warnings()[0]).toMatchObject({level:'hard',severity:'planned'});
    let a=s.assignments.find(a=>a.dog_id==='demo-1')!;
    await repo.attendance(date,a.id,'present',a.version);
    s=await repo.snapshot(date); expect(warnings()[0]).toMatchObject({level:'hard',severity:'present'});
    const rule=s.rules[0]; await repo.saveRule({...rule,level:'soft'});
    s=await repo.snapshot(date); expect(warnings()[0]).toMatchObject({level:'soft',severity:'present'});
    a=s.assignments.find(x=>x.id===a.id)!;
    await repo.attendance(date,a.id,'departed',a.version);
    s=await repo.snapshot(date); expect(warnings()).toEqual([]);
    a=s.assignments.find(x=>x.id===a.id)!;
    await repo.attendance(date,a.id,'present',a.version);
    s=await repo.snapshot(date); expect(warnings()[0].level).toBe('soft');
    a=s.assignments.find(x=>x.id===a.id)!; await repo.move(date,a.id,null,null,a.version);
    s=await repo.snapshot(date); expect(warnings()).toEqual([]);
  });
  it('checks notes and symmetric rule versions, validation, edits, removals and date persistence',async()=>{
    const repo=demoRepository(),date=todayBrisbane();
    await repo.saveNotes('demo-2','Quiet greeting\nGive space',1);
    await expect(repo.saveNotes('demo-2','Stale',1)).rejects.toThrow(/changed/);
    expect((await repo.snapshot('2030-01-01')).dogs[2].handling_notes).toContain('\n');
    await expect(repo.saveRule({dogs:['demo-2','demo-2'],level:'hard',note:'Invalid'})).rejects.toThrow(/different/);
    await repo.saveRule({dogs:['demo-2','demo-3'],level:'soft',note:'Watch introductions'});
    await expect(repo.saveRule({dogs:['demo-3','demo-2'],level:'hard',note:'Duplicate'})).rejects.toThrow(/already exists/);
    let r=(await repo.snapshot(date)).rules.find(r=>r.dogs.includes('demo-2'))!;
    await repo.saveRule({...r,level:'hard'});
    await expect(repo.removeRule(r.id,r.version)).rejects.toThrow(/changed/);
    r=(await repo.snapshot(date)).rules.find(x=>x.id===r.id)!;
    expect(r).toMatchObject({level:'hard',version:2});
    await repo.removeRule(r.id,r.version);
    expect((await repo.snapshot(date)).rules.some(x=>x.id===r.id)).toBe(false);
  });
});

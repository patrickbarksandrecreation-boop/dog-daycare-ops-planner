import { describe, it, expect } from 'vitest';
import { demoRepository } from '../src/demo';
import { todayBrisbane } from '../src/model';
import { runWarnings } from '../src/runs';
describe('dog markers and daily run warnings',()=>{
  it('warns for both markers once per dog and follows attendance and location',async()=>{
    const repo=demoRepository(), date=todayBrisbane();
    let s=await repo.snapshot(date), a=s.assignments[0], g=s.groups[0];
    await repo.markers(a.dog_id,true,true,1);
    await repo.assignRun(date,g.group_id,'Water park',1);
    await repo.move(date,a.id,g.group_id,null,1);
    s=await repo.snapshot(date); g=s.groups[0];
    let warnings=runWarnings(s.assignments,s.dogs,g);
    expect(warnings).toHaveLength(1); expect(warnings[0].severity).toBe('planned');
    expect(warnings[0].note).toContain('Groomed/bathed'); expect(warnings[0].note).toContain('Owner requested');
    await repo.attendance(date,a.id,'present',2);
    s=await repo.snapshot(date); expect(runWarnings(s.assignments,s.dogs,g)[0].severity).toBe('present');
    await repo.attendance(date,a.id,'departed',3);
    s=await repo.snapshot(date); expect(runWarnings(s.assignments,s.dogs,g)).toEqual([]);
  });
  it('persists markers across dates but resets daily run selection and supports clearing',async()=>{
    const repo=demoRepository(),date=todayBrisbane();
    let s=await repo.snapshot(date); const a=s.assignments[0];
    await repo.markers(a.dog_id,true,false,1);
    await repo.assignRun(date,s.groups[0].group_id,'Water park',1);
    await repo.move(date,a.id,s.groups[0].group_id,null,1);
    s=await repo.snapshot(date); expect(runWarnings(s.assignments,s.dogs,s.groups[0])).toHaveLength(1);
    await repo.assignRun(date,s.groups[0].group_id,'Farm',2);
    s=await repo.snapshot(date); expect(runWarnings(s.assignments,s.dogs,s.groups[0])).toEqual([]);
    const other=await repo.snapshot('2030-01-01'); expect(other.groups[0].run).toBeUndefined(); expect(other.dogs[0].groomed).toBe(true);
    await repo.saveDog({...s.dogs[0],name:'Updated name'}); expect((await repo.snapshot(date)).dogs[0].groomed).toBe(true);
    await expect(repo.markers(a.dog_id,false,false,1)).rejects.toThrow(/changed/);
    await repo.markers(a.dog_id,false,false,2); expect((await repo.snapshot(date)).dogs[0].groomed).toBe(false);
  });
});

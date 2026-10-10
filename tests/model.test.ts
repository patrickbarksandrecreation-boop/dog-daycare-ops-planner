import { describe, expect, it } from 'vitest';
import { counts, groupCounts, lane, sameName, todayBrisbane } from '../src/model';
import { demoRepository } from '../src/demo';
import { demoRules, groupConflicts } from '../src/behaviour';
describe('daily planning and attendance', () => {
  it('uses Brisbane midnight, not host date', () => {
    expect(todayBrisbane(new Date('2026-10-08T13:59:00Z'))).toBe('2026-10-08');
    expect(todayBrisbane(new Date('2026-10-08T14:00:00Z'))).toBe('2026-10-09');
  });
  it('starts with every booking Expected and unassigned, with master records separate', async () => {
    const repo=demoRepository(); const state=await repo.snapshot(todayBrisbane());
    expect(state.dogs).toHaveLength(110);
    expect(counts(state.assignments)).toEqual({total:100,assigned:0,unassigned:100,expected:100,present:0,departed:0});
    expect((await repo.snapshot('2030-01-02')).assignments).toEqual([]);
  });
  it('deduplicates booking without resetting attendance or changing the location', async () => {
    const repo=demoRepository(), date=todayBrisbane(); let state=await repo.snapshot(date);
    let a=state.assignments[0];
    await repo.move(date,a.id,state.groups[0].group_id,null,a.version);
    a=(await repo.snapshot(date)).assignments[0]; expect(a.attendance_status).toBe('expected');
    await repo.attendance(date,a.id,'present',a.version);
    a=(await repo.snapshot(date)).assignments[0];
    await repo.move(date,a.id,state.groups[1].group_id,null,a.version);
    a=(await repo.snapshot(date)).assignments[0];
    await repo.attendance(date,a.id,'departed',a.version);
    await repo.add(date,a.dog_id);
    state=await repo.snapshot(date);
    expect(state.assignments).toHaveLength(100);
    expect(state.assignments[0].attendance_status).toBe('departed');
    expect(state.assignments[0].group_id).toBe(state.groups[1].group_id);
    expect(lane(state.assignments,state.groups[1].group_id)).toEqual([]);
  });
  it('derives planned versus present conflicts from composition and attendance', async () => {
    const repo=demoRepository('planned'), date=todayBrisbane(); let state=await repo.snapshot(date);
    const first=state.groups[0].group_id;
    expect(groupConflicts(state.assignments,first,demoRules)[0].severity).toBe('planned');
    let archie=state.assignments.find(a=>a.dog_id==='demo-1')!;
    await repo.attendance(date,archie.id,'present',archie.version);
    state=await repo.snapshot(date);
    expect(groupConflicts(state.assignments,first,demoRules)[0].severity).toBe('present');
    expect(groupCounts(state.assignments,first)).toEqual({planned:30,present:11});
    archie=state.assignments.find(a=>a.dog_id==='demo-1')!;
    await repo.move(date,archie.id,state.groups[1].group_id,null,archie.version);
    state=await repo.snapshot(date);
    expect(groupConflicts(state.assignments,first,demoRules)).toEqual([]);
    expect(state.assignments.find(a=>a.dog_id==='demo-1')!.attendance_status).toBe('present');
    expect(groupConflicts(state.assignments,state.groups[1].group_id,demoRules)[0].severity).toBe('present');
  });
  it('clears only Expected bookings and preserves received/departed history', async () => {
    const repo=demoRepository('planned'), date=todayBrisbane(); let state=await repo.snapshot(date);
    const a=state.assignments[0]; await repo.attendance(date,a.id,'departed',a.version);
    state=await repo.snapshot(date);
    await expect(repo.remove(date,a.id,state.assignments[0].version)).rejects.toThrow(/cannot be removed/);
    await expect(repo.clear(date,state.day.revision-1)).rejects.toThrow(/changed/);
    await repo.clear(date,state.day.revision);
    state=await repo.snapshot(date);
    expect(counts(state.assignments)).toMatchObject({expected:0,present:30,departed:1,total:31});
  });
  it('supports four data-driven groups and explicit duplicate-name checks', async () => {
    const state=await demoRepository('four').snapshot(todayBrisbane());
    expect(state.groups).toHaveLength(4);
    expect(state.groups.map(g=>lane(state.assignments,g.group_id).length)).toEqual([22,22,22,22]);
    expect(sameName(' Luna  Rose ','luna rose')).toBe(true);
    expect(sameName('Luna','Luna Rose')).toBe(false);
  });
});

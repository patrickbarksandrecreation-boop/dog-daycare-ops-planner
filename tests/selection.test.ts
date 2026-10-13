import { expect, it } from 'vitest';
import { toggleSelection } from '../src/selection';
import { demoRepository } from '../src/demo';
import { todayBrisbane } from '../src/model';

it('toggles independently across groups and Unassigned and retains captured versions', () => {
  const a = { id: 'a', version: 1, group_id: 'one' };
  const b = { id: 'b', version: 2, group_id: 'two' };
  const c = { id: 'c', version: 1, group_id: null };
  let selected = toggleSelection(toggleSelection(toggleSelection([], a), b), c);
  expect(selected).toEqual([a, b, c]);
  a.version++;
  expect(selected[0].version).toBe(1);
  selected = toggleSelection(selected, b);
  expect(selected.map(s => s.id)).toEqual(['a', 'c']);
});

it('demo bulk moves validate all dogs before writes and notify once without changing attendance', async () => {
  const repo = demoRepository('planned'), date = todayBrisbane();
  let changes = 0;
  repo.watch(date, () => changes++, () => {});
  const before = await repo.snapshot(date);
  const selections = [before.assignments[0], before.assignments[31], before.assignments[99]];
  await repo.moveMany(date, selections, 'group-3');
  const after = await repo.snapshot(date);
  expect(changes).toBe(1);
  selections.forEach(a => expect(after.assignments.find(s => s.id === a.id)).toMatchObject({
    group_id: 'group-3', version: a.version + 1, attendance_status: a.attendance_status,
    arrived_at: a.arrived_at, departed_at: a.departed_at,
  }));
  await expect(repo.moveMany(date, [after.assignments[2], selections[0]], null)).rejects.toThrow(/changed/);
  expect(await repo.snapshot(date)).toEqual(after);
  await expect(repo.moveMany(date, [after.assignments[0], after.assignments[0]], null)).rejects.toThrow(/distinct/);
  expect(await repo.snapshot(date)).toEqual(after);
  await repo.moveMany(date, selections.map(a => after.assignments.find(s => s.id === a.id)!), null);
  expect((await repo.snapshot(date)).assignments.filter(a => selections.some(s => s.id === a.id)).every(a => a.group_id === null)).toBe(true);
});

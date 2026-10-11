import { isActive } from './model';
import type { Assignment, Dog, Group } from './model';
export function runWarnings(assignments: Assignment[], dogs: Dog[], group: Group) {
  if (group.run !== 'Water park') return [];
  const lookup = new Map(dogs.map(d => [d.id, d]));
  return assignments.filter(a => isActive(a) && a.group_id === group.group_id).flatMap(a => {
    const dog = lookup.get(a.dog_id);
    if (!dog || (!dog.groomed && !dog.no_waterpark)) return [];
    return [{ id: a.id, dog_id: dog.id, severity: a.attendance_status === 'present' ? 'present' as const : 'planned' as const,
      note: `${dog.name}: ${[dog.groomed && 'Groomed/bathed', dog.no_waterpark && 'Owner requested no water park'].filter(Boolean).join(' · ')} — ${a.attendance_status === 'present' ? 'in' : 'planned for'} Water park.` }];
  });
}

import { isActive } from './model';
import type { Assignment } from './model';

export type InteractionRule = {
  id: string;
  dogs: [string, string];
  note: string;
  active: boolean;
  level: 'hard' | 'soft';
  version: number;
  updated_at?: string;
  updated_by?: string;
};
export type Conflict = InteractionRule & { severity: 'planned' | 'present' };

// Fictional IDs only. Never use names to infer behavioural compatibility.
export const demoRules: InteractionRule[] = [
  { id: 'demo-pair-1', dogs: ['demo-0', 'demo-1'], note: 'Keep Alfie and Archie in separate play groups.', active: true, level: 'hard', version: 1 },
  { id: 'demo-pair-2', dogs: ['demo-30', 'demo-31'], note: 'Monitor these fictional dogs during introductions.', active: true, level: 'soft', version: 1 },
];
export const demoNotes: Record<string, string> = {
  'demo-0': 'Fictional handling note: give Alfie a quiet greeting and space during introductions.',
  'demo-1': 'Fictional handling note: Archie benefits from a calm handover.',
  'demo-30': 'Fictional handling note: use a gradual introduction.',
};
export const ruleLabel = (level: InteractionRule['level']) => level === 'hard' ? 'Hard · Must not mix.' : 'Soft · Monitor closely and assess.';
export function groupConflicts(items: Assignment[], group: string, rules: InteractionRule[]): Conflict[] {
  const members = new Map(items.filter(a => isActive(a) && a.group_id === group).map(a => [a.dog_id, a]));
  return rules.flatMap(rule => {
    const [a, b] = rule.dogs.map(id => members.get(id));
    return rule.active && a && b
      ? [{ ...rule, severity: a.attendance_status === 'present' && b.attendance_status === 'present' ? 'present' as const : 'planned' as const }]
      : [];
  });
}

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { AlertTriangle, Pencil } from 'lucide-react';
export function GroupLane({ id, name, present, planned, order, selected, dragging, destination, rename, editor, children, warnings, runSelector, showWarnings }: {
  id: string; name: string; present: number; planned: number; order: number;
  selected: boolean; dragging: boolean; destination: () => void;
  rename?: () => void; editor?: ReactNode; children: ReactNode; warnings: { severity: 'present' | 'planned'; level?: 'hard' | 'soft' }[];
  runSelector?: ReactNode; showWarnings?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const live = warnings.filter(w => w.severity === 'present').length;
  const potential = warnings.length - live;
  const hard = warnings.filter(w => w.level === 'hard').length;
  const soft = warnings.filter(w => w.level === 'soft').length;
  const red = hard > 0 || warnings.some(w => !w.level && w.severity === 'present');
  return <section ref={setNodeRef} data-testid={`lane-${id}`}
    className={`group-lane tone-${order} ${selected || dragging ? 'valid-target' : ''} ${isOver ? 'drop-over' : ''}`}
    onClick={event => {
      if (selected && !(event.target as HTMLElement).closest('button,input,select,form,article')) destination();
    }}>
    <header className="group-heading">
      <button className="group-destination" aria-label={`Move selected dogs to ${name}`} disabled={!selected} onClick={destination}>
        <h2>{name}</h2><span className="group-counts" data-testid={`counts-${id}`}><b>{present}</b> present <i>/</i> <b>{planned}</b> planned</span>
      </button>
      {rename && <button className="icon-button" onClick={rename} aria-label={`Rename ${name}`}><Pencil size={15}/></button>}
      {runSelector}
    </header>
    <div className={`warning-bar ${red ? 'live-warning' : warnings.length ? 'planned-warning' : ''}`} data-testid={`warnings-${id}`}>
      {warnings.length > 0 ? <button className="warning-details" onClick={showWarnings} aria-label={`View warnings for ${name}`}><AlertTriangle size={15}/><span>{hard > 0 && `${hard} Hard · Must not mix. `}{soft > 0 && `${soft} Soft · Monitor closely. `}{live > 0 && `${live} present conflict${live > 1 ? 's' : ''}`}{live > 0 && potential > 0 && ' · '}{potential > 0 && `${potential} planned conflict${potential > 1 ? 's' : ''}`}</span></button> : <span className="warning-placeholder">Interaction & run alerts</span>}
    </div>
    {editor}
    <div className="group-grid">{children}</div>
    {planned === 0 && <button className="empty-group" disabled={!selected} onClick={destination}>
      {selected ? 'Move selected dogs here' : 'Drop dogs here, or select a dog then this group'}
    </button>}
  </section>;
}

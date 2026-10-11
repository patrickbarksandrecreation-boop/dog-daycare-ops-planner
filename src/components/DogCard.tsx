import { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Check, GripVertical, Info, Sparkles, DropletOff } from 'lucide-react';
import type { Assignment, Dog } from '../model';
import { Avatar } from './Avatar';
export function DogCard({ assignment, dog, selected, disabled, indicator, select, info, arrive }: {
  assignment: Assignment; dog: Dog; selected: boolean; disabled: boolean;
  indicator: string | undefined; select: () => void; info: () => void; arrive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: assignment.id, disabled });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const cancelHold = () => clearTimeout(timer.current);
  useEffect(() => {
    document.addEventListener('scroll', cancelHold, true);
    return () => { cancelHold(); document.removeEventListener('scroll', cancelHold, true); };
  }, []);
  return <article ref={setNodeRef} data-testid={`card-${dog.name}`} data-dog-id={dog.id}
    className={`dog-card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${assignment.attendance_status}`}
    style={{ transform: CSS.Transform.toString(transform), transition }}
    onContextMenu={event => { event.preventDefault(); cancelHold(); info(); }}>
    <button className="drag-handle" {...attributes} {...listeners} disabled={disabled}
      aria-label={`Drag ${dog.name}`} title="Drag to move"><GripVertical size={16}/></button>
    <button className="card-select" aria-label={`Select ${dog.name}`} aria-pressed={selected} disabled={disabled}
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } select(); }}
      onDoubleClick={() => { cancelHold(); info(); }}
      onPointerDown={event => {
        suppressClick.current = false;
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
        start.current = { x: event.clientX, y: event.clientY }; cancelHold();
        timer.current = setTimeout(() => { suppressClick.current = true; info(); }, 550);
      }}
      onPointerMove={event => { if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8) cancelHold(); }}
      onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}>
      <Avatar dog={dog}/><span className="dog-name" title={dog.name}>{dog.name}</span>
      {dog.groomed && <Sparkles className="dog-marker groomed" size={14} aria-label="Groomed/bathed"/>}
      {dog.no_waterpark && <DropletOff className="dog-marker no-water" size={14} aria-label="No water park"/>}
    </button>
    <span className="indicator-slot" title={indicator}>{indicator && <AlertTriangle size={14} aria-label={indicator}/>}</span>
    {assignment.attendance_status === 'expected'
      ? <button className="arrival-action" aria-label={`Mark ${dog.name} present`} disabled={disabled} onClick={arrive}>Arrive</button>
      : <span className="present-mark" aria-label={`${dog.name} is present`} title="Present"><Check size={13}/>Here</span>}
    <button className="info-action" aria-label={`Information for ${dog.name}`} onClick={info}><Info size={16}/></button>
  </article>;
}

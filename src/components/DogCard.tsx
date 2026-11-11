import { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Check, Circle, GripVertical, Info, Sparkles, DropletOff, LoaderCircle } from 'lucide-react';
import type { Assignment, Dog } from '../model';
import { Avatar } from './Avatar';
import { breedLabel } from '../dogLabels';
import { dogColourStyle } from '../dogColours';
export function DogCard({ assignment, dog, shortName, selected, disabled, pending = false, indicator, select, info, arrive }: {
  assignment: Assignment; dog: Dog; selected: boolean; disabled: boolean;
  pending?: boolean;
  shortName: string;
  indicator: string | undefined; select: () => void; info: () => void; arrive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: assignment.id, disabled });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touch = useRef<{ id: number; x: number; y: number; active: boolean; blocked: boolean } | null>(null);
  const lastScroll = useRef(-Infinity);
  const cancelHold = () => clearTimeout(timer.current);
  const trackMovement = (event: { pointerId: number; clientX: number; clientY: number }) => {
    const gesture = touch.current;
    if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 8) {
      gesture.blocked = true; cancelHold();
    }
  };
  useEffect(() => {
    const scrolled = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('dialog')) return;
      lastScroll.current = performance.now(); cancelHold();
      if (touch.current?.active) touch.current.blocked = true;
    };
    document.addEventListener('scroll', scrolled, true);
    return () => { cancelHold(); document.removeEventListener('scroll', scrolled, true); };
  }, []);
  return <article ref={setNodeRef} data-testid={`card-${dog.name}`} data-dog-id={dog.id}
    className={`dog-card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${pending ? 'pending' : ''} ${assignment.attendance_status}`}
    aria-busy={pending}
    style={{ ...dogColourStyle(dog.card_colour), transform: CSS.Transform.toString(transform), transition }}
    onPointerDownCapture={event => {
      cancelHold(); touch.current = null;
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      // The dedicated grip keeps its own drag sensor and never starts a hold.
      if ((event.target as HTMLElement).closest('.drag-handle')) return;
      const gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, active: true,
        blocked: !event.isPrimary || performance.now() - lastScroll.current < 150 };
      touch.current = gesture;
      if (!gesture.blocked && (event.target as HTMLElement).closest('.card-select') && !disabled) {
        timer.current = setTimeout(() => { gesture.blocked = true; info(); }, 550);
      }
    }}
    onPointerMoveCapture={trackMovement}
    onPointerUpCapture={event => { trackMovement(event); cancelHold(); if (touch.current) touch.current.active = false; }}
    onPointerCancelCapture={() => { cancelHold(); if (touch.current) { touch.current.blocked = true; touch.current.active = false; } }}
    onPointerLeave={cancelHold}
    onKeyDownCapture={() => { cancelHold(); touch.current = null; }}
    onClickCapture={event => {
      // Touch browsers can synthesize a click after a short swipe or cancel.
      // The latch lasts for the entire gesture, even if the finger moves back.
      // Keyboard activation (detail=0) remains independent of touch history.
      if (event.detail !== 0 && touch.current?.blocked) { event.preventDefault(); event.stopPropagation(); }
    }}
    onContextMenu={event => { event.preventDefault(); cancelHold(); if (!touch.current?.blocked) info(); }}>
    <button className="drag-handle" {...attributes} {...listeners} disabled={disabled}
      aria-label={`Drag ${dog.name}`} title="Drag to move"><GripVertical size={16}/></button>
    <button className="card-select" aria-label={`Select ${dog.name}`} aria-pressed={selected} disabled={disabled}
      onClick={select}
      onDoubleClick={() => { cancelHold(); if (!touch.current?.blocked) info(); }}>
      <Avatar dog={dog}/><span className="card-caption"><span className="dog-name" title={dog.name}>{shortName}</span>
      {dog.breed && <span className="breed-label" title={dog.breed}>{breedLabel(dog.breed)}</span>}</span>
      <span className="card-markers">
      {dog.groomed && <Sparkles className="dog-marker groomed" size={14} aria-label="Groomed/bathed"/>}
      {dog.no_waterpark && <DropletOff className="dog-marker no-water" size={14} aria-label="No water park"/>}
      </span>
    </button>
    <span className="indicator-slot" title={indicator}>{indicator && <AlertTriangle size={14} aria-label={indicator}/>}</span>
    {assignment.attendance_status === 'expected'
      ? <button className="arrival-action" title="Expected — mark present" aria-label={`Mark ${dog.name} present`} disabled={disabled} onClick={arrive}><Circle size={15}/><span className="attendance-label">Arrive</span></button>
      : <span className="present-mark" aria-label={`${dog.name} is present`} title="Present"><Check size={15}/><span className="attendance-label">Here</span></span>}
    <button className="info-action" aria-label={`Information for ${dog.name}`} onClick={info}><Info size={16}/></button>
    {pending && <span className="card-saving" role="status" aria-label={`Saving changes for ${dog.name}`}><LoaderCircle size={12}/><span>Saving</span></span>}
  </article>;
}

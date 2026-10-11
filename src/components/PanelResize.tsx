import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';

// Widths belong to this browser's board view, never to shared dog placements.
export function usePanelSizes() {
  const layoutRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [heights, setHeights] = useState<Record<string, number>>({});
  const resize = (id: string, dx: number, dy: number, initial?: { widths: number[]; height: number }) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const panels = Array.from(layout.querySelectorAll<HTMLElement>('[data-panel-id]'));
    const index = panels.findIndex(panel => panel.dataset.panelId === id);
    if (index < 0) return;
    const current = initial?.widths || panels.map(panel => panel.getBoundingClientRect().width);
    const total = current.reduce((sum, width) => sum + width, 0);
    const minimum = Math.min(180, total / panels.length);
    const target = Math.max(minimum, Math.min(total - minimum * (panels.length - 1), current[index] + dx));
    // Redistribute only the spare space, preserving every neighbour's minimum.
    const spare = current.reduce((sum, width, i) => sum + (i === index ? 0 : Math.max(0, width - minimum)), 0);
    const remaining = total - target - minimum * (panels.length - 1);
    setWidths(Object.fromEntries(panels.map((panel, i) => [panel.dataset.panelId!, i === index ? target : minimum + remaining * (spare ? Math.max(0, current[i] - minimum) / spare : 1 / (panels.length - 1))])));
    const height = initial?.height ?? panels[index].getBoundingClientRect().height;
    if (dy) setHeights(previous => ({ ...previous, [id]: Math.max(180, height + dy) }));
  };
  const style = (id: string): CSSProperties => ({ '--panel-min-height': heights[id] ? heights[id] + 'px' : undefined } as CSSProperties);
  const columns = (ids: string[]): CSSProperties => {
    const existing = Object.values(widths);
    const fallback = existing.length ? existing.reduce((sum, width) => sum + width, 0) / existing.length : 1;
    return { '--panel-columns': ids.map(id => `minmax(min(180px, calc((100vw - 32px - ${14 * (ids.length - 1)}px) / ${ids.length})), ${widths[id] || fallback}fr)`).join(' ') } as CSSProperties;
  };
  return { layoutRef, resize, style, columns };
}

export function PanelResize({ id, name, resize, widthOnly = false }: {
  id: string; name: string; resize: ReturnType<typeof usePanelSizes>['resize']; widthOnly?: boolean;
}) {
  const start = useRef<{ x: number; y: number; widths: number[]; height: number } | null>(null);
  return <button className={`panel-resize ${widthOnly ? 'panel-width-resize' : ''}`} aria-label={`Resize ${widthOnly ? 'width of ' : ''}${name}`}
    title={widthOnly ? 'Drag sideways to resize width. Left and right arrow keys also resize.' : 'Drag to resize. Arrow keys adjust width and height.'}
    onClick={event => event.stopPropagation()}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      const panel = event.currentTarget.closest<HTMLElement>('[data-panel-id]')!;
      const layout = panel.closest('.lane-layout')!;
      start.current = { x: event.clientX, y: event.clientY, widths: Array.from(layout.querySelectorAll<HTMLElement>('[data-panel-id]')).map(p => p.getBoundingClientRect().width), height: panel.getBoundingClientRect().height };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (start.current) resize(id, event.clientX - start.current.x, widthOnly ? 0 : event.clientY - start.current.y, start.current);
    }}
    onPointerUp={event => { start.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { start.current = null; }}
    onLostPointerCapture={() => { start.current = null; }}
    onKeyDown={event => {
      const steps: Record<string, [number, number]> = { ArrowLeft: [-32, 0], ArrowRight: [32, 0], ArrowUp: [0, -32], ArrowDown: [0, 32] };
      if (steps[event.key] && (!widthOnly || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); event.stopPropagation(); resize(id, ...steps[event.key]); }
    }}><span aria-hidden="true">{widthOnly ? '↔' : '◢'}</span></button>;
}

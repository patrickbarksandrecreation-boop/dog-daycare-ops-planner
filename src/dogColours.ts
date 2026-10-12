import type { CSSProperties } from 'react';

export const defaultColour = '#ffffff';
export const validColour = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
export const colourPresets = [
  ['White', '#ffffff'], ['Pink', '#f8d7e5'], ['Peach', '#ffe0c2'],
  ['Yellow', '#fff1ae'], ['Green', '#d5edce'], ['Blue', '#cfe5fa'], ['Purple', '#e3d7f5'],
] as const;

export function dogColourStyle(value?: string): CSSProperties {
  const colour = value && validColour(value) ? value : defaultColour;
  const rgb = [1, 3, 5].map(start => {
    const c = parseInt(colour.slice(start, start + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return { '--dog-colour': colour, '--dog-ink': luminance > 0.179 ? '#000000' : '#ffffff' } as CSSProperties;
}

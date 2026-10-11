import { expect, it } from 'vitest';
import { breedLabel, matchesDog, shortDogNames } from '../src/dogLabels';
import type { Dog } from '../src/model';
const dog = (id: string, name: string, breed?: string): Dog => ({ id, name, breed, photo_path: null, is_archived: false });
it('uses explicit breed aliases and preserves mixed/unknown labels without invented acronyms', () => {
  expect(breedLabel(' German Shepherd Dog ')).toBe('GSD');
  expect(breedLabel('Border Collie')).toBe('BC');
  expect(breedLabel('Australian Cattle Dog')).toBe('ACD');
  expect(breedLabel('Unknown')).toBe('Unknown');
  expect(breedLabel('Labrador x Poodle')).toBe('Labrador x Poodle');
  expect(breedLabel('Unrecognised long breed name')).toBe('Unrecognised long…');
  expect(breedLabel(null)).toBe('');
});
it('distinguishes repeated first names and identical full names with stable suffixes', () => {
  const dogs = [dog('3','Luna Rose'),dog('1','Luna Reed'),dog('2','Luna Reed'),dog('4','Alfie')];
  const labels = shortDogNames(dogs);
  expect(new Set(labels.values()).size).toBe(4);
  expect(labels.get('4')).toBe('Alfie');
  expect(shortDogNames([...dogs].reverse())).toEqual(labels);
});
it('searches full names and full breeds without requiring either breed or photo', () => {
  expect(matchesDog(dog('1','Luna Rose','German Shepherd Dog'),'shepherd')).toBe(true);
  expect(matchesDog(dog('1','Luna Rose'),'rose')).toBe(true);
  expect(matchesDog(dog('1','Luna Rose'),'shepherd')).toBe(false);
});

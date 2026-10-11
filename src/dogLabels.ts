import type { Dog } from './model';

// Explicit aliases only: never infer a breed from a name or photograph.
export const breedLabels: Record<string, string> = {
  'german shepherd dog': 'GSD', 'german shepherd': 'GSD',
  'border collie': 'BC', 'australian cattle dog': 'ACD',
  'cavalier king charles spaniel': 'Cavalier', 'golden retriever': 'Golden',
  'labrador retriever': 'Lab', labrador: 'Lab',
  'staffordshire bull terrier': 'Staffy', 'australian shepherd': 'Aussie',
  'jack russell terrier': 'Jack Russell', 'miniature schnauzer': 'Mini Schnauzer',
};
export function breedLabel(breed?: string | null): string {
  const full = breed?.trim().replace(/\s+/g, ' ') || '';
  return breedLabels[full.toLocaleLowerCase()] || (full.length > 18 ? `${full.slice(0, 17).trimEnd()}…` : full);
}
export function shortDogNames(dogs: Dog[]): Map<string, string> {
  const first = (d: Dog) => d.name.trim().split(/\s+/)[0];
  const labels = new Map<string, string>();
  for (const dog of dogs) {
    const peers = dogs.filter(d => first(d).toLocaleLowerCase() === first(dog).toLocaleLowerCase());
    const initial = dog.name.trim().split(/\s+/)[1]?.[0];
    let label = peers.length > 1 && initial ? `${first(dog)} ${initial}.` : first(dog);
    const matches = peers.filter(d => d.name.trim().split(/\s+/)[1]?.[0]?.toLocaleLowerCase() === initial?.toLocaleLowerCase());
    if (matches.length > 1) label += ` ·${[...matches].sort((a,b) => a.id.localeCompare(b.id)).findIndex(d => d.id === dog.id) + 1}`;
    labels.set(dog.id, label);
  }
  return labels;
}
export const matchesDog = (dog: Dog, query: string) =>
  `${dog.name}\n${dog.breed || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

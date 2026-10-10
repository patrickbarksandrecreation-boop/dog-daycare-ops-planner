export const groupIds = ['group-1', 'group-2', 'group-3'] as const
export type GroupId = (typeof groupIds)[number]
export type Placement = GroupId | 'unassigned'
// Presence means selected for today; the value is the dog's only location.
export type Board = Readonly<Partial<Record<string, Placement>>>
export interface Dog { id: string; name: string }

const names = ['Alfie', 'Biscuit', 'Clover', 'Daisy', 'Echo', 'Frankie', 'Hazel', 'Juno', 'Milo', 'Pippin']
const surnames = ['Acorn', 'Bramble', 'Cloud', 'Dapple', 'Fern', 'Meadow', 'Pebble', 'Reed', 'Sprout', 'Willow']
export const dogs: readonly Dog[] = names.flatMap((name, i) =>
  surnames.map((surname, j) => ({ id: `DOG-${String(i * 10 + j + 1).padStart(3, '0')}`, name: `${name} ${surname}` })),
)
const dogIds = new Set(dogs.map(dog => dog.id))

export function addDog(board: Board, id: string, placement: Placement): Board {
  if (!dogIds.has(id) || board[id] !== undefined) return board
  return { ...board, [id]: placement }
}

export function moveDog(board: Board, id: string, placement: Placement): Board {
  if (board[id] === undefined) return board
  return { ...board, [id]: placement }
}

export function searchDogs(roster: readonly Dog[], query: string): Dog[] {
  const term = query.trim().toLowerCase()
  return roster.filter(dog => `${dog.name} ${dog.id}`.toLowerCase().includes(term))
}

export function rosterFor(board: Board, placement?: Placement): Dog[] {
  return dogs.filter(dog => board[dog.id] !== undefined && (placement === undefined || board[dog.id] === placement))
}

export function countGroups(board: Board): Record<Placement, number> {
  const counts = { 'group-1': 0, 'group-2': 0, 'group-3': 0, unassigned: 0 }
  for (const dog of rosterFor(board)) counts[board[dog.id]!]++
  return counts
}

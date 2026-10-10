import { describe, expect, it } from 'vitest'
import { addDog, countGroups, dogs, moveDog, rosterFor, searchDogs } from './board'

describe('fictional fixtures', () => {
  it('provides exactly 100 unique, stable IDs and names', () => {
    expect(dogs).toHaveLength(100)
    expect(new Set(dogs.map(dog => dog.id)).size).toBe(100)
    expect(new Set(dogs.map(dog => dog.name)).size).toBe(100)
    expect(dogs[0]).toEqual({ id: 'DOG-001', name: 'Alfie Acorn' })
    expect(dogs[99]).toEqual({ id: 'DOG-100', name: 'Pippin Willow' })
  })
})

describe('authoritative placement', () => {
  it('does not duplicate or relocate a dog when added twice', () => {
    const first = addDog({}, 'DOG-001', 'group-1')
    const second = addDog(first, 'DOG-001', 'group-2')
    expect(rosterFor(second)).toHaveLength(1)
    expect(rosterFor(second, 'group-1')).toHaveLength(1)
    expect(rosterFor(second, 'group-2')).toHaveLength(0)
    expect(second).toBe(first)
  })
  it('moves between groups and unassigned without changing attendance', () => {
    const first = addDog({}, 'DOG-001', 'group-1')
    const moved = moveDog(first, 'DOG-001', 'group-3')
    expect(rosterFor(moved, 'group-1')).toEqual([])
    expect(rosterFor(moved, 'group-3')).toEqual([dogs[0]])
    const unassigned = moveDog(moved, 'DOG-001', 'unassigned')
    expect(rosterFor(unassigned, 'group-3')).toEqual([])
    expect(rosterFor(unassigned, 'unassigned')).toEqual([dogs[0]])
    expect(rosterFor(unassigned)).toHaveLength(1)
    expect(first['DOG-001']).toBe('group-1')
  })
  it('rejects unknown dogs and does not move a dog not selected today', () => {
    expect(addDog({}, 'unknown', 'group-1')).toEqual({})
    expect(moveDog({}, 'DOG-001', 'group-1')).toEqual({})
  })
  it('keeps totals correct after repeated moves', () => {
    let board = addDog({}, 'DOG-001', 'group-1')
    board = addDog(board, 'DOG-002', 'group-1')
    board = addDog(board, 'DOG-003', 'unassigned')
    board = moveDog(board, 'DOG-002', 'group-2')
    board = moveDog(board, 'DOG-002', 'group-2')
    expect(countGroups(board)).toEqual({ 'group-1': 1, 'group-2': 1, 'group-3': 0, unassigned: 1 })
    expect(Object.values(countGroups(board)).reduce((a, b) => a + b, 0)).toBe(rosterFor(board).length)
  })
})

describe('roster search', () => {
  const board = addDog(addDog({}, 'DOG-001', 'group-1'), 'DOG-011', 'group-2')
  it('searches names and IDs, ignoring case and surrounding whitespace', () => {
    expect(searchDogs(rosterFor(board), '  ALFIE  ')).toEqual([dogs[0]])
    expect(searchDogs(rosterFor(board), 'dog-011')).toEqual([dogs[10]])
  })
  it('searches only the selected roster and does not change the group total', () => {
    const roster = rosterFor(board, 'group-1')
    expect(searchDogs(roster, 'Biscuit')).toEqual([])
    expect(searchDogs(roster, '')).toEqual(roster)
    expect(countGroups(board)['group-1']).toBe(1)
  })
})

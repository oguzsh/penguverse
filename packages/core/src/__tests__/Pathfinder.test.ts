import { describe, test, expect } from 'bun:test';
import { Pathfinder } from '../scene/Pathfinder';

function makeGrid(rows: number, cols: number, fill = true): boolean[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

describe('Pathfinder', () => {
  test('finds direct path on open grid', () => {
    const grid = makeGrid(5, 5);
    const pf = new Pathfinder(grid);
    const path = pf.findPath(0, 0, 4, 4);
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 4, y: 4 });
  });

  test('returns empty for unreachable target', () => {
    const grid = makeGrid(5, 5);
    // Block column 2 entirely
    for (let r = 0; r < 5; r++) grid[r][2] = false;
    const pf = new Pathfinder(grid);
    const path = pf.findPath(0, 0, 4, 0);
    expect(path).toEqual([]);
  });

  test('returns empty when target is unwalkable', () => {
    const grid = makeGrid(5, 5);
    grid[4][4] = false;
    const pf = new Pathfinder(grid);
    const path = pf.findPath(0, 0, 4, 4);
    expect(path).toEqual([]);
  });

  test('finds path around obstacle', () => {
    const grid = makeGrid(5, 5);
    // Wall at row 2, cols 1-3
    grid[2][1] = false;
    grid[2][2] = false;
    grid[2][3] = false;
    const pf = new Pathfinder(grid);
    const path = pf.findPath(2, 0, 2, 4);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 2, y: 4 });
    // Path should not pass through blocked cells
    for (const p of path) {
      expect(grid[p.y][p.x]).toBe(true);
    }
  });

  test('path from A to A is single node or empty', () => {
    const grid = makeGrid(3, 3);
    const pf = new Pathfinder(grid);
    const path = pf.findPath(1, 1, 1, 1);
    // A* returns the node itself
    expect(path.length).toBeLessThanOrEqual(1);
  });

  test('uses Manhattan heuristic (4-directional)', () => {
    const grid = makeGrid(3, 3);
    const pf = new Pathfinder(grid);
    const path = pf.findPath(0, 0, 2, 2);
    // Manhattan distance = 4, so path should be 5 nodes (start + 4 steps)
    expect(path.length).toBe(5);
  });

  test('getWalkableTiles returns all walkable tiles', () => {
    const grid = makeGrid(3, 3);
    grid[1][1] = false;
    const pf = new Pathfinder(grid);
    const walkable = pf.getWalkableTiles();
    expect(walkable.length).toBe(8);
    expect(walkable.find(t => t.x === 1 && t.y === 1)).toBeUndefined();
  });

  test('getWalkableTiles caches result', () => {
    const grid = makeGrid(3, 3);
    const pf = new Pathfinder(grid);
    const a = pf.getWalkableTiles();
    const b = pf.getWalkableTiles();
    expect(a).toBe(b); // Same reference
  });

  test('handles out-of-bounds coordinates', () => {
    const grid = makeGrid(3, 3);
    const pf = new Pathfinder(grid);
    expect(pf.findPath(0, 0, 10, 10)).toEqual([]);
    expect(pf.findPath(-1, -1, 2, 2)).toEqual([]);
  });

  test('isWalkable checks bounds', () => {
    const grid = makeGrid(3, 3);
    const pf = new Pathfinder(grid);
    expect(pf.isWalkable(0, 0)).toBe(true);
    expect(pf.isWalkable(-1, 0)).toBe(false);
    expect(pf.isWalkable(0, -1)).toBe(false);
    expect(pf.isWalkable(3, 0)).toBe(false);
    expect(pf.isWalkable(0, 3)).toBe(false);
  });
});

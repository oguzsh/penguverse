import { describe, test, expect, mock } from 'bun:test';
import { PenguinNavigation } from '../penguins/PenguinNavigation';
import { Pathfinder } from '../scene/Pathfinder';
import { TileReservation } from '../penguins/TileReservation';

function makeGrid(rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(true));
}

function makePenguin(x = 0, y = 0) {
  const p: any = {
    x: x * 32,
    y: y * 32,
    agentId: 'test-agent',
    state: 'idle',
    getTilePosition() { return { x: Math.round(this.x / 32), y: Math.round(this.y / 32) }; },
    walkTo: mock(() => {}),
  };
  return p;
}

describe('PenguinNavigation', () => {
  test('goToAnchor navigates to named anchor', () => {
    const penguin = makePenguin(0, 0);
    const nav = new PenguinNavigation(penguin);
    const pathfinder = new Pathfinder(makeGrid(5, 5));
    const locations = [{ name: 'desk', x: 3, y: 3, type: 'work' as const }];

    const result = nav.goToAnchor('desk', locations, pathfinder);
    expect(result).toBe(true);
    expect(penguin.walkTo).toHaveBeenCalled();
    expect(nav.getCurrentAnchor()).toBe('desk');
  });

  test('goToAnchor returns false for missing anchor', () => {
    const penguin = makePenguin(0, 0);
    const nav = new PenguinNavigation(penguin);
    const pathfinder = new Pathfinder(makeGrid(5, 5));

    const result = nav.goToAnchor('missing', [], pathfinder);
    expect(result).toBe(false);
  });

  test('goToAnchor at current position returns true without walking', () => {
    const penguin = makePenguin(3, 3);
    const nav = new PenguinNavigation(penguin);
    const pathfinder = new Pathfinder(makeGrid(5, 5));
    const locations = [{ name: 'desk', x: 3, y: 3, type: 'work' as const }];

    const result = nav.goToAnchor('desk', locations, pathfinder);
    expect(result).toBe(true);
    expect(penguin.walkTo).not.toHaveBeenCalled();
  });

  test('goToAnchor respects reservation', () => {
    const penguin = makePenguin(0, 0);
    const nav = new PenguinNavigation(penguin);
    const pathfinder = new Pathfinder(makeGrid(5, 5));
    const reservation = new TileReservation();
    reservation.reserve(3, 3, 'other-agent');
    const locations = [{ name: 'desk', x: 3, y: 3, type: 'work' as const }];

    const result = nav.goToAnchor('desk', locations, pathfinder, reservation);
    expect(result).toBe(false);
  });

  test('goToAnchorType finds random matching anchor', () => {
    const penguin = makePenguin(0, 0);
    const nav = new PenguinNavigation(penguin);
    const pathfinder = new Pathfinder(makeGrid(5, 5));
    const locations = [
      { name: 'desk1', x: 2, y: 2, type: 'work' as const },
      { name: 'desk2', x: 4, y: 4, type: 'work' as const },
    ];

    const result = nav.goToAnchorType('work', locations, pathfinder);
    expect(result).toBe(true);
    expect(penguin.walkTo).toHaveBeenCalled();
  });

  test('goToAnchorType returns false for no candidates', () => {
    const penguin = makePenguin(0, 0);
    const nav = new PenguinNavigation(penguin);
    const pathfinder = new Pathfinder(makeGrid(5, 5));
    const locations = [{ name: 'desk', x: 2, y: 2, type: 'work' as const }];

    const result = nav.goToAnchorType('rest', locations, pathfinder);
    expect(result).toBe(false);
  });

  test('goToAnchorType excludes specified names', () => {
    const penguin = makePenguin(0, 0);
    const nav = new PenguinNavigation(penguin);
    const pathfinder = new Pathfinder(makeGrid(5, 5));
    const locations = [{ name: 'only-work', x: 2, y: 2, type: 'work' as const }];

    const result = nav.goToAnchorType('work', locations, pathfinder, undefined, new Set(['only-work']));
    expect(result).toBe(false);
  });

  test('goToAnchorType with reservation skips occupied tiles', () => {
    const penguin = makePenguin(0, 0);
    const nav = new PenguinNavigation(penguin);
    const pathfinder = new Pathfinder(makeGrid(5, 5));
    const reservation = new TileReservation();
    reservation.reserve(2, 2, 'other');
    const locations = [
      { name: 'a', x: 2, y: 2, type: 'work' as const },
      { name: 'b', x: 4, y: 4, type: 'work' as const },
    ];

    const result = nav.goToAnchorType('work', locations, pathfinder, reservation);
    expect(result).toBe(true);
    expect(nav.getCurrentAnchor()).toBe('b');
  });

  test('walkToRandomTile finds walkable tile', () => {
    const penguin = makePenguin(0, 0);
    const nav = new PenguinNavigation(penguin);
    const pathfinder = new Pathfinder(makeGrid(5, 5));

    nav.walkToRandomTile(pathfinder);
    expect(penguin.walkTo).toHaveBeenCalled();
  });

  test('walkToRandomTile respects reservation', () => {
    const penguin = makePenguin(2, 2);
    const nav = new PenguinNavigation(penguin);
    const grid = makeGrid(3, 3);
    const pathfinder = new Pathfinder(grid);
    const reservation = new TileReservation();
    // Reserve all tiles except current
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (x !== 2 || y !== 2) {
          reservation.reserve(x, y, 'other');
        }
      }
    }

    nav.walkToRandomTile(pathfinder, reservation);
    // Should not have walked because no available tiles
    expect(penguin.walkTo).not.toHaveBeenCalled();
  });

  test('resetIdleTimer triggers next idle immediately', () => {
    const penguin = makePenguin(0, 0);
    const nav = new PenguinNavigation(penguin);
    const pathfinder = new Pathfinder(makeGrid(5, 5));
    const locations = { center: { x: 3, y: 3 } };

    // Without reset, timer hasn't elapsed yet
    nav.updateIdleBehavior(0.1, pathfinder, locations);
    expect(penguin.walkTo).not.toHaveBeenCalled();

    // After reset, next call with large delta should trigger
    nav.resetIdleTimer();
    nav.updateIdleBehavior(10, pathfinder, locations);
    expect(penguin.walkTo).toHaveBeenCalled();
  });
});

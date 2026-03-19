import { describe, test, expect, mock } from 'bun:test';
import { createNpcState, updateNpcPhase } from '../penguins/NpcBehavior';
import { Pathfinder } from '../scene/Pathfinder';

function makeGrid(rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(true));
}

function makePenguin(state = 'idle' as any) {
  return {
    x: 0,
    y: 0,
    state,
    energy: 1,
    agentId: 'npc-1',
    navigation: { resetIdleTimer: mock(() => {}) },
    getHomePosition: () => 'home',
    goToAnchor: mock(() => true),
    goToAnchorType: mock(() => true),
    updateState: mock(function(this: any, s: string, t: any, e: number) {
      this.state = s;
    }),
    getTilePosition: () => ({ x: 0, y: 0 }),
    walkTo: mock(() => {}),
    isMoving: () => false,
  } as any;
}

describe('NpcBehavior', () => {
  test('createNpcState initializes idle phase', () => {
    const state = createNpcState();
    expect(state.phase).toBe('idle');
    expect(state.phaseTimer).toBe(0);
    expect(state.phaseDuration).toBeGreaterThan(0);
  });

  test('updateNpcPhase does nothing before timer expires', () => {
    const penguin = makePenguin();
    const npc = createNpcState();
    npc.phaseDuration = 10;
    const pathfinder = new Pathfinder(makeGrid(5, 5));

    updateNpcPhase(penguin, npc, 1, pathfinder);
    expect(npc.phaseTimer).toBe(1);
    expect(npc.phase).toBe('idle');
    expect(penguin.updateState).not.toHaveBeenCalled();
  });

  test('updateNpcPhase transitions from idle after timer', () => {
    const penguin = makePenguin();
    const npc = createNpcState();
    npc.phaseDuration = 1;

    const pathfinder = new Pathfinder(makeGrid(5, 5));
    const locations = [
      { name: 'work1', x: 2, y: 2, type: 'work' as const },
      { name: 'rest1', x: 4, y: 4, type: 'rest' as const },
    ];

    updateNpcPhase(penguin, npc, 2, pathfinder, locations);

    // Phase should have changed from idle
    expect(npc.phase === 'working' || npc.phase === 'resting').toBe(true);
  });

  test('updateNpcPhase transitions to idle from working', () => {
    const penguin = makePenguin('working');
    const npc = createNpcState();
    npc.phase = 'working';
    npc.phaseDuration = 1;

    const pathfinder = new Pathfinder(makeGrid(5, 5));

    updateNpcPhase(penguin, npc, 2, pathfinder);

    expect(npc.phase).toBe('idle');
    expect(penguin.updateState).toHaveBeenCalled();
  });

  test('updateNpcPhase resets idle timer on idle transition', () => {
    const penguin = makePenguin('working');
    const npc = createNpcState();
    npc.phase = 'working';
    npc.phaseDuration = 1;

    const pathfinder = new Pathfinder(makeGrid(5, 5));

    updateNpcPhase(penguin, npc, 2, pathfinder);

    expect(penguin.navigation.resetIdleTimer).toHaveBeenCalled();
  });

  test('updateNpcPhase falls back to idle if no anchors reachable', () => {
    const penguin = makePenguin();
    penguin.goToAnchor = mock(() => false);
    penguin.goToAnchorType = mock(() => false);
    const npc = createNpcState();
    npc.phaseDuration = 1;

    const pathfinder = new Pathfinder(makeGrid(5, 5));
    const locations = [{ name: 'work1', x: 2, y: 2, type: 'work' as const }];

    // Force working phase
    Math.random = () => 0.3; // < 0.6 → working
    updateNpcPhase(penguin, npc, 2, pathfinder, locations);

    // Should reset to idle since no anchor reachable
    expect(npc.phase).toBe('idle');
    Math.random = globalThis.Math.random; // restore
  });
});

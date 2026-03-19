import { describe, test, expect, mock } from 'bun:test';
import { PenguinMovement, STATE_ANIMATION_MAP } from '../penguins/PenguinMovement';

function makePenguin() {
  return {
    x: 0,
    y: 0,
    state: 'idle' as any,
    visible: true,
    separationX: 0,
    separationY: 0,
    animator: { play: mock(() => {}), getCurrentAnimation: () => 'idle_down' },
    isAnchored: () => false,
  } as any;
}

describe('PenguinMovement', () => {
  test('walkTo sets path and starts moving', () => {
    const penguin = makePenguin();
    const movement = new PenguinMovement(penguin, 32, 32);
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    movement.walkTo(path);
    expect(movement.isMoving()).toBe(true);
  });

  test('walkTo with single node does nothing', () => {
    const penguin = makePenguin();
    const movement = new PenguinMovement(penguin, 32, 32);
    movement.walkTo([{ x: 0, y: 0 }]);
    expect(movement.isMoving()).toBe(false);
  });

  test('walkTo with empty path does nothing', () => {
    const penguin = makePenguin();
    const movement = new PenguinMovement(penguin, 32, 32);
    movement.walkTo([]);
    expect(movement.isMoving()).toBe(false);
  });

  test('setTilePosition sets pixel coordinates', () => {
    const penguin = makePenguin();
    const movement = new PenguinMovement(penguin, 32, 32);
    movement.setTilePosition(3, 4);
    expect(penguin.x).toBe(96);
    expect(penguin.y).toBe(128);
  });

  test('setPixelPosition sets exact coordinates', () => {
    const penguin = makePenguin();
    const movement = new PenguinMovement(penguin, 32, 32);
    movement.setPixelPosition(100, 200);
    expect(penguin.x).toBe(100);
    expect(penguin.y).toBe(200);
  });

  test('getTilePosition returns rounded tile coords', () => {
    const penguin = makePenguin();
    penguin.x = 100;
    penguin.y = 200;
    const movement = new PenguinMovement(penguin, 32, 32);
    const tile = movement.getTilePosition();
    expect(tile.x).toBe(3);
    expect(tile.y).toBe(6);
  });

  test('updateMovement interpolates position', () => {
    const penguin = makePenguin();
    penguin.x = 0;
    penguin.y = 0;
    const movement = new PenguinMovement(penguin, 32, 32);
    movement.walkTo([{ x: 0, y: 0 }, { x: 1, y: 0 }]);

    // Small delta: should interpolate
    movement.updateMovement(0.25);
    expect(penguin.x).toBeGreaterThan(0);
    expect(penguin.x).toBeLessThan(32);
  });

  test('updateMovement completes path', () => {
    const penguin = makePenguin();
    const movement = new PenguinMovement(penguin, 32, 32);
    movement.walkTo([{ x: 0, y: 0 }, { x: 1, y: 0 }]);

    // Large delta to complete the step
    movement.updateMovement(1.0);
    expect(penguin.x).toBe(32);

    // No more movement
    expect(movement.isMoving()).toBe(false);
  });

  test('updateMovement plays directional animations', () => {
    const penguin = makePenguin();
    const movement = new PenguinMovement(penguin, 32, 32);

    // Moving right
    movement.walkTo([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    movement.updateMovement(0.1);
    expect(penguin.animator.play).toHaveBeenCalledWith('walk_right');

    // Moving down
    penguin.x = 0;
    penguin.y = 0;
    const movement2 = new PenguinMovement(penguin, 32, 32);
    movement2.walkTo([{ x: 0, y: 0 }, { x: 0, y: 1 }]);
    movement2.updateMovement(0.1);
    expect(penguin.animator.play).toHaveBeenCalledWith('walk_down');
  });

  test('applySeparation pushes apart close penguins', () => {
    const penguin = makePenguin();
    penguin.x = 0;
    penguin.y = 0;
    const other = makePenguin();
    other.x = 10;
    other.y = 0;

    const movement = new PenguinMovement(penguin, 32, 32);
    movement.applySeparation([other], 0.016);

    // Should push penguin away from other (negative x direction)
    expect(penguin.separationX).toBeLessThan(0);
  });

  test('applySeparation does nothing for anchored penguins', () => {
    const penguin = makePenguin();
    penguin.isAnchored = () => true;
    const other = makePenguin();
    other.x = 10;

    const movement = new PenguinMovement(penguin, 32, 32);
    movement.applySeparation([other], 0.016);

    expect(penguin.separationX).toBe(0);
  });

  test('applySeparation does nothing for invisible penguins', () => {
    const penguin = makePenguin();
    penguin.visible = false;
    const other = makePenguin();
    other.x = 10;

    const movement = new PenguinMovement(penguin, 32, 32);
    movement.applySeparation([other], 0.016);

    expect(penguin.separationX).toBe(0);
  });

  test('applySeparation clamps offset to max', () => {
    const penguin = makePenguin();
    const other = makePenguin();
    other.x = 1;
    other.y = 0;

    const movement = new PenguinMovement(penguin, 32, 32);
    // Many iterations to saturate
    for (let i = 0; i < 100; i++) {
      movement.applySeparation([other], 0.1);
    }

    // Max offset is tileWidth * 0.5 = 16
    expect(Math.abs(penguin.separationX)).toBeLessThanOrEqual(16);
    expect(Math.abs(penguin.separationY)).toBeLessThanOrEqual(16);
  });

  test('STATE_ANIMATION_MAP covers all states', () => {
    const states = ['working', 'idle', 'thinking', 'error', 'sleeping', 'listening', 'speaking', 'offline'] as const;
    for (const state of states) {
      expect(STATE_ANIMATION_MAP[state]).toBeDefined();
    }
  });
});

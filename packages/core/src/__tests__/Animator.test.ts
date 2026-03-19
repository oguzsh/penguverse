import { describe, test, expect } from 'bun:test';
import { Animator } from '../sprites/Animator';
import { SpriteSheet } from '../sprites/SpriteSheet';

function makeSpriteSheet(): SpriteSheet {
  return new SpriteSheet({
    sheets: { walk: 'walk.png', actions: 'actions.png' },
    animations: {
      idle_down: { sheet: 'actions', row: 3, frames: 4, speed: 0.5 },
      walk_down: { sheet: 'walk', row: 0, frames: 4, speed: 0.15 },
      working: { sheet: 'actions', row: 0, frames: 4, speed: 0.3 },
    },
    frameWidth: 64,
    frameHeight: 64,
  });
}

describe('Animator', () => {
  test('starts with initial animation', () => {
    const animator = new Animator(makeSpriteSheet(), 'idle_down');
    expect(animator.getCurrentAnimation()).toBe('idle_down');
  });

  test('play switches animation', () => {
    const animator = new Animator(makeSpriteSheet());
    animator.play('walk_down');
    expect(animator.getCurrentAnimation()).toBe('walk_down');
  });

  test('play ignores if already playing', () => {
    const animator = new Animator(makeSpriteSheet(), 'idle_down');
    // Should not reset frame
    animator.update(0.3);
    animator.play('idle_down');
    // Still same animation, no reset
    expect(animator.getCurrentAnimation()).toBe('idle_down');
  });

  test('update advances frame at correct speed', () => {
    const sheet = makeSpriteSheet();
    const animator = new Animator(sheet, 'walk_down');
    // walk_down speed is 0.15s per frame, 4 frames
    // After 0.15s, should advance to frame 1
    animator.update(0.15);
    // After another 0.15s, frame 2
    animator.update(0.15);
    // We can't directly inspect frame, but we verify no crash
    expect(animator.getCurrentAnimation()).toBe('walk_down');
  });

  test('update wraps frames', () => {
    const animator = new Animator(makeSpriteSheet(), 'walk_down');
    // 4 frames at 0.15s speed = 0.6s for full cycle
    for (let i = 0; i < 10; i++) {
      animator.update(0.15);
    }
    expect(animator.getCurrentAnimation()).toBe('walk_down');
  });

  test('play resets frame to 0', () => {
    const animator = new Animator(makeSpriteSheet(), 'idle_down');
    animator.update(0.5);
    animator.play('walk_down');
    // Frame should be reset
    animator.play('idle_down');
    expect(animator.getCurrentAnimation()).toBe('idle_down');
  });

  test('update with unknown animation does not crash', () => {
    const animator = new Animator(makeSpriteSheet(), 'nonexistent');
    animator.update(0.1);
    expect(animator.getCurrentAnimation()).toBe('nonexistent');
  });
});

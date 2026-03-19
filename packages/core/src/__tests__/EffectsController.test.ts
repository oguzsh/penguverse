import { describe, test, expect, mock } from 'bun:test';
import { EffectsController } from '../EffectsController';

function makeParticles() {
  return {
    emitZzz: mock(() => {}),
    emitThought: mock(() => {}),
    emitExclamation: mock(() => {}),
  } as any;
}

function makePenguin(state: string) {
  return { agentId: 'p1', state, x: 100, y: 200 } as any;
}

describe('EffectsController', () => {
  test('emits Zzz for sleeping penguins after interval', () => {
    const particles = makeParticles();
    const effects = new EffectsController(particles);
    const penguin = makePenguin('sleeping');

    effects.updatePenguinEffects(penguin, 0.5);
    expect(particles.emitZzz).not.toHaveBeenCalled();

    effects.updatePenguinEffects(penguin, 0.5);
    expect(particles.emitZzz).not.toHaveBeenCalled();

    effects.updatePenguinEffects(penguin, 0.6); // total > 1.5
    expect(particles.emitZzz).toHaveBeenCalledWith(100, 200, penguin);
  });

  test('emits thought for thinking penguins', () => {
    const particles = makeParticles();
    const effects = new EffectsController(particles);
    const penguin = makePenguin('thinking');

    effects.updatePenguinEffects(penguin, 2.1);
    expect(particles.emitThought).toHaveBeenCalledWith(100, 200, penguin);
  });

  test('emits exclamation for error penguins', () => {
    const particles = makeParticles();
    const effects = new EffectsController(particles);
    const penguin = makePenguin('error');

    effects.updatePenguinEffects(penguin, 2.1);
    expect(particles.emitExclamation).toHaveBeenCalledWith(100, 200, penguin);
  });

  test('does not emit for idle penguins', () => {
    const particles = makeParticles();
    const effects = new EffectsController(particles);
    const penguin = makePenguin('idle');

    effects.updatePenguinEffects(penguin, 5);
    expect(particles.emitZzz).not.toHaveBeenCalled();
    expect(particles.emitThought).not.toHaveBeenCalled();
    expect(particles.emitExclamation).not.toHaveBeenCalled();
  });

  test('resets timer after emission', () => {
    const particles = makeParticles();
    const effects = new EffectsController(particles);
    const penguin = makePenguin('sleeping');

    effects.updatePenguinEffects(penguin, 2); // triggers
    expect(particles.emitZzz).toHaveBeenCalledTimes(1);

    effects.updatePenguinEffects(penguin, 0.5); // not yet
    expect(particles.emitZzz).toHaveBeenCalledTimes(1);

    effects.updatePenguinEffects(penguin, 1.1); // triggers again
    expect(particles.emitZzz).toHaveBeenCalledTimes(2);
  });

  test('tracks timers per penguin', () => {
    const particles = makeParticles();
    const effects = new EffectsController(particles);
    const p1 = makePenguin('sleeping');
    const p2 = { agentId: 'p2', state: 'sleeping', x: 0, y: 0 } as any;

    effects.updatePenguinEffects(p1, 2);
    expect(particles.emitZzz).toHaveBeenCalledTimes(1);

    effects.updatePenguinEffects(p2, 0.5);
    expect(particles.emitZzz).toHaveBeenCalledTimes(1); // p2 timer hasn't expired
  });
});

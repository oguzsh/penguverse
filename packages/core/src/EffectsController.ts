import type { Penguin } from './penguins/Penguin';
import type { ParticleSystem } from './effects/Particles';

export class EffectsController {
  private particleTimers: Map<string, number> = new Map();

  constructor(private particles: ParticleSystem) {}

  updatePenguinEffects(penguin: Penguin, delta: number) {
    const key = penguin.agentId;
    const timer = (this.particleTimers.get(key) ?? 0) + delta;
    this.particleTimers.set(key, timer);

    if (penguin.state === 'sleeping' && timer > 1.5) {
      this.particleTimers.set(key, 0);
      this.particles.emitZzz(penguin.x, penguin.y, penguin);
    }

    if (penguin.state === 'thinking' && timer > 2) {
      this.particleTimers.set(key, 0);
      this.particles.emitThought(penguin.x, penguin.y, penguin);
    }

    if (penguin.state === 'error' && timer > 2) {
      this.particleTimers.set(key, 0);
      this.particles.emitExclamation(penguin.x, penguin.y, penguin);
    }
  }
}

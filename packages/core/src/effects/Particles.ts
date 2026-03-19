import type { RenderLayer } from '../renderer/RenderLayer';

interface ParticleTarget {
  x: number;
  y: number;
  getSittingOffset(): number;
}

interface Particle {
  text: string;
  size: number;
  life: number;
  maxLife: number;
  /** Offset from target top-right */
  offsetX: number;
  offsetY: number;
  /** Small float animation */
  floatPhase: number;
  target?: ParticleTarget;
  /** Fallback absolute position when no target */
  x: number;
  y: number;
}

export class ParticleSystem implements RenderLayer {
  readonly order = 35;
  private particles: Particle[] = [];

  emitZzz(x: number, y: number, target?: ParticleTarget) {
    this.particles.push({
      x, y,
      offsetX: 30,
      offsetY: -8,
      floatPhase: Math.random() * Math.PI * 2,
      life: 2,
      maxLife: 2,
      text: 'Z',
      size: 10 + Math.random() * 6,
      target,
    });
  }

  emitExclamation(x: number, y: number, target?: ParticleTarget) {
    this.particles.push({
      x, y,
      offsetX: 30,
      offsetY: -8,
      floatPhase: 0,
      life: 1.5,
      maxLife: 1.5,
      text: '!',
      size: 14,
      target,
    });
  }

  emitThought(x: number, y: number, target?: ParticleTarget) {
    this.particles.push({
      x, y,
      offsetX: 30,
      offsetY: -8,
      floatPhase: Math.random() * Math.PI * 2,
      life: 2,
      maxLife: 2,
      text: '...',
      size: 10,
      target,
    });
  }

  update(delta: number) {
    for (const p of this.particles) {
      p.life -= delta;
      p.floatPhase += delta * 2;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  render(ctx: CanvasRenderingContext2D, delta: number) {
    this.update(delta);

    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      // Pin to target's top-right, with gentle vertical bob
      let drawX: number;
      let drawY: number;
      if (p.target) {
        drawX = p.target.x + p.offsetX;
        drawY = p.target.y - p.target.getSittingOffset() + p.offsetY + Math.sin(p.floatPhase) * 2;
      } else {
        drawX = p.x + p.offsetX;
        drawY = p.y + p.offsetY + Math.sin(p.floatPhase) * 2;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 0.5;
      ctx.font = `bold ${p.size}px monospace`;
      ctx.strokeText(p.text, drawX, drawY);
      ctx.fillText(p.text, drawX, drawY);
      ctx.restore();
    }
  }
}

import type { AgentState } from '@penguverse/types';
import type { Penguin } from './Penguin';

const STATE_ANIMATION_MAP: Record<AgentState, string> = {
  working: 'working',
  idle: 'idle_down',
  thinking: 'idle_down',
  error: 'idle_down',
  sleeping: 'sleeping',
  listening: 'idle_down',
  speaking: 'talking',
  offline: 'idle_down',
};

export { STATE_ANIMATION_MAP };

export class PenguinMovement {
  private path: { x: number; y: number }[] = [];
  private pathIndex = 0;
  private moveSpeed = 2;
  private moveProgress = 0;

  constructor(
    private penguin: Penguin,
    private tileWidth: number,
    private tileHeight: number,
  ) {}

  walkTo(path: { x: number; y: number }[]) {
    if (path.length <= 1) return;
    this.path = path;
    this.pathIndex = 1;
    this.moveProgress = 0;
  }

  isMoving(): boolean {
    return this.pathIndex < this.path.length;
  }

  setTilePosition(tileX: number, tileY: number) {
    this.penguin.x = tileX * this.tileWidth;
    this.penguin.y = tileY * this.tileHeight;
  }

  setPixelPosition(x: number, y: number) {
    this.penguin.x = x;
    this.penguin.y = y;
  }

  getTilePosition(): { x: number; y: number } {
    return {
      x: Math.round(this.penguin.x / this.tileWidth),
      y: Math.round(this.penguin.y / this.tileHeight),
    };
  }

  updateMovement(delta: number) {
    if (this.pathIndex >= this.path.length) return;

    const target = this.path[this.pathIndex];
    const targetX = target.x * this.tileWidth;
    const targetY = target.y * this.tileHeight;

    const dx = targetX - this.penguin.x;
    const dy = targetY - this.penguin.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      this.penguin.animator.play(dx > 0 ? 'walk_right' : 'walk_left');
    } else {
      this.penguin.animator.play(dy > 0 ? 'walk_down' : 'walk_up');
    }

    this.moveProgress += delta * this.moveSpeed;

    if (this.moveProgress >= 1) {
      this.penguin.x = targetX;
      this.penguin.y = targetY;
      this.moveProgress = 0;
      this.pathIndex++;

      if (this.pathIndex >= this.path.length) {
        this.path = [];
        this.pathIndex = 0;
        const anim = STATE_ANIMATION_MAP[this.penguin.state] ?? 'idle_down';
        this.penguin.animator.play(anim);
      }
    } else {
      const prevTarget = this.path[this.pathIndex - 1];
      const prevX = prevTarget.x * this.tileWidth;
      const prevY = prevTarget.y * this.tileHeight;
      this.penguin.x = prevX + (targetX - prevX) * this.moveProgress;
      this.penguin.y = prevY + (targetY - prevY) * this.moveProgress;
    }
  }

  applySeparation(others: Penguin[], delta: number) {
    if (this.penguin.isAnchored() || !this.penguin.visible) return;

    const minDist = this.tileWidth * 1.5;
    let pushX = 0;
    let pushY = 0;

    for (const other of others) {
      if (other === this.penguin || !other.visible) continue;

      const dx = this.penguin.x - other.x;
      const dy = this.penguin.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist && dist > 0.01) {
        const strength = (minDist - dist) / minDist;
        pushX += (dx / dist) * strength;
        pushY += (dy / dist) * strength;
      } else if (dist <= 0.01) {
        const angle = Math.random() * Math.PI * 2;
        pushX += Math.cos(angle) * 0.5;
        pushY += Math.sin(angle) * 0.5;
      }
    }

    const speed = 60 * delta;
    this.penguin.separationX += pushX * speed;
    this.penguin.separationY += pushY * speed;

    const decay = 0.9;
    this.penguin.separationX *= decay;
    this.penguin.separationY *= decay;

    const maxOffset = this.tileWidth * 0.5;
    this.penguin.separationX = Math.max(-maxOffset, Math.min(maxOffset, this.penguin.separationX));
    this.penguin.separationY = Math.max(-maxOffset, Math.min(maxOffset, this.penguin.separationY));
  }
}

import { Animator } from '../sprites/Animator';
import { SpriteSheet } from '../sprites/SpriteSheet';
import type { RenderLayer } from '../renderer/RenderLayer';
import type { Pathfinder } from '../scene/Pathfinder';

export type AgentState =
  | 'working'
  | 'idle'
  | 'thinking'
  | 'error'
  | 'sleeping'
  | 'listening'
  | 'speaking'
  | 'offline';

export type AnchorType = 'work' | 'rest' | 'social' | 'utility' | 'wander';

export interface TypedLocation {
  name: string;
  x: number;
  y: number;
  type: AnchorType;
}

export interface PenguinConfig {
  agentId: string;
  name: string;
  sprite: string;
  position: string;
  npc?: boolean;
}

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

export class Penguin {
  readonly agentId: string;
  readonly name: string;
  readonly animator: Animator;
  readonly spriteSheet: SpriteSheet;

  x = 0;
  y = 0;
  state: AgentState = 'idle';
  task: string | null = null;
  energy = 1;
  visible = true;

  separationX = 0;
  separationY = 0;

  private path: { x: number; y: number }[] = [];
  private pathIndex = 0;
  private moveSpeed = 2;
  private moveProgress = 0;
  private homePosition = '';
  private tileWidth = 32;
  private tileHeight = 32;
  private frameWidth: number;
  private frameHeight: number;

  private idleBehaviorTimer = 0;
  private idleBehaviorInterval = 5 + Math.random() * 5;
  private currentAnchor: string | null = null;

  readonly isNpc: boolean;
  private npcPhase: 'idle' | 'working' | 'resting' = 'idle';
  private npcPhaseTimer = 0;
  private npcPhaseDuration = 0;

  constructor(
    config: PenguinConfig,
    spriteSheet: SpriteSheet,
    tileWidth: number,
    tileHeight: number,
  ) {
    this.agentId = config.agentId;
    this.name = config.name;
    this.spriteSheet = spriteSheet;
    this.animator = new Animator(spriteSheet);
    this.homePosition = config.position;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.frameWidth = spriteSheet.config.frameWidth;
    this.frameHeight = spriteSheet.config.frameHeight;
    this.isNpc = config.npc ?? false;
    if (this.isNpc) {
      this.npcPhase = 'idle';
      this.npcPhaseDuration = 3 + Math.random() * 5;
    }
  }

  getHomePosition(): string {
    return this.homePosition;
  }

  setHomePosition(position: string) {
    this.homePosition = position;
  }

  setPixelPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  setTilePosition(tileX: number, tileY: number) {
    this.x = tileX * this.tileWidth;
    this.y = tileY * this.tileHeight;
  }

  getTilePosition(): { x: number; y: number } {
    return {
      x: Math.round(this.x / this.tileWidth),
      y: Math.round(this.y / this.tileHeight),
    };
  }

  walkTo(path: { x: number; y: number }[]) {
    if (path.length <= 1) return;
    this.path = path;
    this.pathIndex = 1;
    this.moveProgress = 0;
  }

  isMoving(): boolean {
    return this.pathIndex < this.path.length;
  }

  updateState(state: AgentState, task: string | null, energy: number) {
    const prevState = this.state;
    this.state = state;
    this.task = task;
    this.energy = energy;
    this.visible = state !== 'offline';

    if (prevState !== state && !this.isMoving()) {
      const anim = STATE_ANIMATION_MAP[state] ?? 'idle_down';
      this.animator.play(anim);
    }
  }

  faceDirection(dir: 'up' | 'down' | 'left' | 'right') {
    const base = this.state === 'idle' ? 'idle' : 'walk';
    const animName = `${base}_${dir}`;
    if (this.spriteSheet.config.animations[animName]) {
      this.animator.play(animName);
    }
  }

  update(
    delta: number,
    pathfinder: Pathfinder,
    locations: Record<string, { x: number; y: number }>,
    typedLocations?: TypedLocation[],
    reservation?: import('./TileReservation').TileReservation,
    excludeNames?: Set<string>,
  ) {
    if (this.isNpc && !this.isMoving()) {
      this.updateNpcPhase(delta, pathfinder, typedLocations, reservation, excludeNames);
    }

    if (this.isMoving()) {
      this.updateMovement(delta);
    } else if (this.state === 'idle') {
      this.updateIdleBehavior(delta, pathfinder, locations, typedLocations, reservation, excludeNames);
    } else {
      const anim = STATE_ANIMATION_MAP[this.state] ?? 'idle_down';
      if (this.animator.getCurrentAnimation() !== anim) {
        this.animator.play(anim);
      }
    }

    this.animator.update(delta);
  }

  private updateNpcPhase(
    delta: number,
    pathfinder: Pathfinder,
    typedLocations?: TypedLocation[],
    reservation?: import('./TileReservation').TileReservation,
    excludeNames?: Set<string>,
  ) {
    this.npcPhaseTimer += delta;
    if (this.npcPhaseTimer < this.npcPhaseDuration) return;
    this.npcPhaseTimer = 0;

    if (this.npcPhase === 'idle') {
      this.npcPhase = Math.random() < 0.6 ? 'working' : 'resting';
      this.npcPhaseDuration = 10 + Math.random() * 20;
    } else {
      this.npcPhase = 'idle';
      this.npcPhaseDuration = 5 + Math.random() * 10;
    }

    const newState: AgentState = this.npcPhase === 'working' ? 'working'
      : this.npcPhase === 'resting' ? 'sleeping'
      : 'idle';

    if (newState !== this.state) {
      let reached = false;
      if (typedLocations && typedLocations.length > 0) {
        if (newState === 'working') {
          const home = this.getHomePosition();
          reached = this.goToAnchor(home, typedLocations, pathfinder, reservation)
            || this.goToAnchorType('work', typedLocations, pathfinder, reservation, excludeNames);
        } else if (newState === 'sleeping') {
          reached = this.goToAnchorType('rest', typedLocations, pathfinder, reservation, excludeNames);
        }
      }

      if (newState === 'idle' || reached) {
        this.updateState(newState, null, this.energy);
        if (newState === 'idle') {
          this.idleBehaviorTimer = this.idleBehaviorInterval;
        }
      } else {
        this.npcPhase = 'idle';
        this.npcPhaseDuration = 3 + Math.random() * 5;
      }
    }
  }

  private updateMovement(delta: number) {
    if (this.pathIndex >= this.path.length) return;

    const target = this.path[this.pathIndex];
    const targetX = target.x * this.tileWidth;
    const targetY = target.y * this.tileHeight;

    const dx = targetX - this.x;
    const dy = targetY - this.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      this.animator.play(dx > 0 ? 'walk_right' : 'walk_left');
    } else {
      this.animator.play(dy > 0 ? 'walk_down' : 'walk_up');
    }

    this.moveProgress += delta * this.moveSpeed;

    if (this.moveProgress >= 1) {
      this.x = targetX;
      this.y = targetY;
      this.moveProgress = 0;
      this.pathIndex++;

      if (this.pathIndex >= this.path.length) {
        this.path = [];
        this.pathIndex = 0;
        const anim = STATE_ANIMATION_MAP[this.state] ?? 'idle_down';
        this.animator.play(anim);
      }
    } else {
      const prevTarget = this.path[this.pathIndex - 1];
      const prevX = prevTarget.x * this.tileWidth;
      const prevY = prevTarget.y * this.tileHeight;
      this.x = prevX + (targetX - prevX) * this.moveProgress;
      this.y = prevY + (targetY - prevY) * this.moveProgress;
    }
  }

  goToAnchor(
    anchorName: string,
    typedLocations: TypedLocation[],
    pathfinder: Pathfinder,
    reservation?: import('./TileReservation').TileReservation,
  ): boolean {
    const loc = typedLocations.find(l => l.name === anchorName);
    if (!loc) return false;
    if (reservation && !reservation.isAvailable(loc.x, loc.y, this.agentId)) return false;

    const tile = this.getTilePosition();

    if (tile.x === loc.x && tile.y === loc.y) {
      if (reservation) {
        reservation.release(this.agentId);
        reservation.reserve(loc.x, loc.y, this.agentId);
      }
      this.currentAnchor = loc.name;
      return true;
    }

    const path = pathfinder.findPath(tile.x, tile.y, loc.x, loc.y);
    if (path.length > 1) {
      if (reservation) {
        reservation.release(this.agentId);
        reservation.reserve(loc.x, loc.y, this.agentId);
      }
      this.currentAnchor = loc.name;
      this.walkTo(path);
      return true;
    }
    return false;
  }

  goToAnchorType(
    type: AnchorType,
    typedLocations: TypedLocation[],
    pathfinder: Pathfinder,
    reservation?: import('./TileReservation').TileReservation,
    excludeNames?: Set<string>,
  ): boolean {
    const candidates = typedLocations.filter(l =>
      l.type === type && (!excludeNames || !excludeNames.has(l.name))
    );
    if (candidates.length === 0) return false;

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const tile = this.getTilePosition();

    for (const loc of shuffled) {
      if (reservation && !reservation.isAvailable(loc.x, loc.y, this.agentId)) continue;

      if (tile.x === loc.x && tile.y === loc.y) {
        if (reservation) {
          reservation.release(this.agentId);
          reservation.reserve(loc.x, loc.y, this.agentId);
        }
        this.currentAnchor = loc.name;
        return true;
      }

      const path = pathfinder.findPath(tile.x, tile.y, loc.x, loc.y);
      if (path.length > 1) {
        if (reservation) {
          reservation.release(this.agentId);
          reservation.reserve(loc.x, loc.y, this.agentId);
        }
        this.currentAnchor = loc.name;
        this.walkTo(path);
        return true;
      }
    }
    return false;
  }

  getCurrentAnchor(): string | null {
    return this.currentAnchor;
  }

  private updateIdleBehavior(
    delta: number,
    pathfinder: Pathfinder,
    locations: Record<string, { x: number; y: number }>,
    typedLocations?: TypedLocation[],
    reservation?: import('./TileReservation').TileReservation,
    excludeNames?: Set<string>,
  ) {
    this.idleBehaviorTimer += delta;
    if (this.idleBehaviorTimer < this.idleBehaviorInterval) return;

    this.idleBehaviorTimer = 0;
    this.idleBehaviorInterval = 5 + Math.random() * 8;

    if (typedLocations && typedLocations.length > 0) {
      const preferredTypes: AnchorType[] = ['wander', 'social', 'utility'];
      const available = preferredTypes.filter(t =>
        typedLocations.some(l => l.type === t && (!excludeNames || !excludeNames.has(l.name)))
      );
      const shuffled = available.sort(() => Math.random() - 0.5);
      for (const type of shuffled) {
        if (this.goToAnchorType(type, typedLocations, pathfinder, reservation, excludeNames)) return;
      }
    }

    const locationNames = Object.keys(locations).sort(() => Math.random() - 0.5);
    const tile = this.getTilePosition();

    for (const target of locationNames) {
      const loc = locations[target];
      if (reservation && !reservation.isAvailable(loc.x, loc.y, this.agentId)) continue;
      const path = pathfinder.findPath(tile.x, tile.y, loc.x, loc.y);
      if (path.length > 1) {
        if (reservation) {
          reservation.release(this.agentId);
          reservation.reserve(loc.x, loc.y, this.agentId);
        }
        this.walkTo(path);
        return;
      }
    }

    this.walkToRandomTile(pathfinder, reservation);
  }

  walkToRandomTile(pathfinder: Pathfinder, reservation?: import('./TileReservation').TileReservation) {
    const tile = this.getTilePosition();
    const walkable = pathfinder.getWalkableTiles();
    if (walkable.length === 0) return;

    const attempts = Math.min(10, walkable.length);
    for (let i = 0; i < attempts; i++) {
      const idx = Math.floor(Math.random() * walkable.length);
      const target = walkable[idx];
      if (Math.abs(target.x - tile.x) + Math.abs(target.y - tile.y) < 2) continue;
      if (reservation && !reservation.isAvailable(target.x, target.y, this.agentId)) continue;
      const path = pathfinder.findPath(tile.x, tile.y, target.x, target.y);
      if (path.length > 1) {
        if (reservation) {
          reservation.release(this.agentId);
          reservation.reserve(target.x, target.y, this.agentId);
        }
        this.walkTo(path);
        return;
      }
    }
  }

  getSittingOffset(): number {
    return (this.state === 'working' || this.state === 'sleeping')
      ? this.tileHeight * 1.2
      : 0;
  }

  isAnchored(): boolean {
    return this.state === 'working' || this.state === 'sleeping';
  }

  applySeparation(others: Penguin[], delta: number) {
    if (this.isAnchored() || !this.visible) return;

    const minDist = this.tileWidth * 1.5;
    let pushX = 0;
    let pushY = 0;

    for (const other of others) {
      if (other === this || !other.visible) continue;

      const dx = this.x - other.x;
      const dy = this.y - other.y;
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
    this.separationX += pushX * speed;
    this.separationY += pushY * speed;

    const decay = 0.9;
    this.separationX *= decay;
    this.separationY *= decay;

    const maxOffset = this.tileWidth * 0.5;
    this.separationX = Math.max(-maxOffset, Math.min(maxOffset, this.separationX));
    this.separationY = Math.max(-maxOffset, Math.min(maxOffset, this.separationY));
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.visible) return;

    const sepX = this.isAnchored() ? 0 : this.separationX;
    const sepY = this.isAnchored() ? 0 : this.separationY;
    const drawX = this.x + (this.tileWidth - this.frameWidth) / 2 + sepX;
    const drawY = this.y + (this.tileHeight - this.frameHeight) - this.getSittingOffset() + sepY;
    this.animator.draw(ctx, drawX, drawY);
  }

  containsPoint(px: number, py: number): boolean {
    const sepX = this.isAnchored() ? 0 : this.separationX;
    const sepY = this.isAnchored() ? 0 : this.separationY;
    const drawX = this.x + (this.tileWidth - this.frameWidth) / 2 + sepX;
    const drawY = this.y + (this.tileHeight - this.frameHeight) + sepY;
    return (
      px >= drawX &&
      px <= drawX + this.frameWidth &&
      py >= drawY &&
      py <= drawY + this.frameHeight
    );
  }
}

export class PenguinLayerBelow implements RenderLayer {
  readonly order = 12;
  private penguins: Penguin[] = [];

  setPenguins(penguins: Penguin[]) { this.penguins = penguins; }

  render(ctx: CanvasRenderingContext2D, _delta: number) {
    const sitting = this.penguins
      .filter(p => p.visible && (p.state === 'working' || p.state === 'sleeping'))
      .sort((a, b) => a.y - b.y);
    for (const penguin of sitting) {
      penguin.draw(ctx);
    }
  }
}

export class PenguinLayerAbove implements RenderLayer {
  readonly order = 20;
  private penguins: Penguin[] = [];

  setPenguins(penguins: Penguin[]) { this.penguins = penguins; }

  render(ctx: CanvasRenderingContext2D, _delta: number) {
    const active = this.penguins
      .filter(p => p.visible && p.state !== 'working' && p.state !== 'sleeping')
      .sort((a, b) => a.y - b.y);
    for (const penguin of active) {
      penguin.draw(ctx);
    }
  }
}

export class PenguinLayer {
  private below: PenguinLayerBelow;
  private above: PenguinLayerAbove;

  constructor() {
    this.below = new PenguinLayerBelow();
    this.above = new PenguinLayerAbove();
  }

  setPenguins(penguins: Penguin[]) {
    this.below.setPenguins(penguins);
    this.above.setPenguins(penguins);
  }

  getLayers(): RenderLayer[] {
    return [this.below, this.above];
  }
}

import { Animator } from '../sprites/Animator';
import { SpriteSheet } from '../sprites/SpriteSheet';
import type { Pathfinder } from '../scene/Pathfinder';
import type { AgentState, AnchorType, TypedLocation, PenguinConfig } from '@penguverse/types';
import { PenguinMovement, STATE_ANIMATION_MAP } from './PenguinMovement';
import { PenguinNavigation } from './PenguinNavigation';
import { NpcState, createNpcState, updateNpcPhase } from './NpcBehavior';
import type { TileReservation } from './TileReservation';

// Re-export layers from their own module
export { PenguinLayer, PenguinLayerBelow, PenguinLayerAbove } from './PenguinLayers';

export class Penguin {
  readonly agentId: string;
  readonly name: string;
  readonly animator: Animator;
  readonly spriteSheet: SpriteSheet;
  readonly navigation: PenguinNavigation;

  x = 0;
  y = 0;
  state: AgentState = 'idle';
  task: string | null = null;
  energy = 1;
  visible = true;
  separationX = 0;
  separationY = 0;

  readonly isNpc: boolean;

  private movement: PenguinMovement;
  private npcState: NpcState | null = null;
  private tileWidth: number;
  private tileHeight: number;
  private frameWidth: number;
  private frameHeight: number;
  private homePosition: string;

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

    this.movement = new PenguinMovement(this, tileWidth, tileHeight);
    this.navigation = new PenguinNavigation(this);

    if (this.isNpc) {
      this.npcState = createNpcState();
    }
  }

  getHomePosition(): string { return this.homePosition; }
  setHomePosition(position: string) { this.homePosition = position; }

  setPixelPosition(x: number, y: number) { this.movement.setPixelPosition(x, y); }
  setTilePosition(tileX: number, tileY: number) { this.movement.setTilePosition(tileX, tileY); }
  getTilePosition(): { x: number; y: number } { return this.movement.getTilePosition(); }
  walkTo(path: { x: number; y: number }[]) { this.movement.walkTo(path); }
  isMoving(): boolean { return this.movement.isMoving(); }
  applySeparation(others: Penguin[], delta: number) { this.movement.applySeparation(others, delta); }

  goToAnchor(
    anchorName: string,
    typedLocations: TypedLocation[],
    pathfinder: Pathfinder,
    reservation?: TileReservation,
  ): boolean {
    return this.navigation.goToAnchor(anchorName, typedLocations, pathfinder, reservation);
  }

  goToAnchorType(
    type: AnchorType,
    typedLocations: TypedLocation[],
    pathfinder: Pathfinder,
    reservation?: TileReservation,
    excludeNames?: Set<string>,
  ): boolean {
    return this.navigation.goToAnchorType(type, typedLocations, pathfinder, reservation, excludeNames);
  }

  getCurrentAnchor(): string | null { return this.navigation.getCurrentAnchor(); }

  walkToRandomTile(pathfinder: Pathfinder, reservation?: TileReservation) {
    this.navigation.walkToRandomTile(pathfinder, reservation);
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
    reservation?: TileReservation,
    excludeNames?: Set<string>,
  ) {
    if (this.isNpc && this.npcState && !this.isMoving()) {
      updateNpcPhase(this, this.npcState, delta, pathfinder, typedLocations, reservation, excludeNames);
    }

    if (this.isMoving()) {
      this.movement.updateMovement(delta);
    } else if (this.state === 'idle') {
      this.navigation.updateIdleBehavior(delta, pathfinder, locations, typedLocations, reservation, excludeNames);
    } else {
      const anim = STATE_ANIMATION_MAP[this.state] ?? 'idle_down';
      if (this.animator.getCurrentAnimation() !== anim) {
        this.animator.play(anim);
      }
    }

    this.animator.update(delta);
  }

  getSittingOffset(): number {
    return (this.state === 'working' || this.state === 'sleeping')
      ? this.tileHeight * 1.2
      : 0;
  }

  isAnchored(): boolean {
    return this.state === 'working' || this.state === 'sleeping';
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

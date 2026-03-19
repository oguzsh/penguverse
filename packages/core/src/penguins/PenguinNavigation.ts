import type { AnchorType, TypedLocation } from '@penguverse/types';
import type { Pathfinder } from '../scene/Pathfinder';
import type { TileReservation } from './TileReservation';
import type { Penguin } from './Penguin';

function claimTile(
  penguin: Penguin,
  x: number,
  y: number,
  reservation?: TileReservation,
): void {
  if (reservation) {
    reservation.release(penguin.agentId);
    reservation.reserve(x, y, penguin.agentId);
  }
}

export class PenguinNavigation {
  private idleBehaviorTimer = 0;
  private idleBehaviorInterval = 5 + Math.random() * 5;
  private currentAnchor: string | null = null;

  constructor(private penguin: Penguin) {}

  getCurrentAnchor(): string | null {
    return this.currentAnchor;
  }

  resetIdleTimer() {
    this.idleBehaviorTimer = this.idleBehaviorInterval;
  }

  goToAnchor(
    anchorName: string,
    typedLocations: TypedLocation[],
    pathfinder: Pathfinder,
    reservation?: TileReservation,
  ): boolean {
    const loc = typedLocations.find(l => l.name === anchorName);
    if (!loc) return false;
    if (reservation && !reservation.isAvailable(loc.x, loc.y, this.penguin.agentId)) return false;

    const tile = this.penguin.getTilePosition();

    if (tile.x === loc.x && tile.y === loc.y) {
      claimTile(this.penguin, loc.x, loc.y, reservation);
      this.currentAnchor = loc.name;
      return true;
    }

    const path = pathfinder.findPath(tile.x, tile.y, loc.x, loc.y);
    if (path.length > 1) {
      claimTile(this.penguin, loc.x, loc.y, reservation);
      this.currentAnchor = loc.name;
      this.penguin.walkTo(path);
      return true;
    }
    return false;
  }

  goToAnchorType(
    type: AnchorType,
    typedLocations: TypedLocation[],
    pathfinder: Pathfinder,
    reservation?: TileReservation,
    excludeNames?: Set<string>,
  ): boolean {
    const candidates = typedLocations.filter(l =>
      l.type === type && (!excludeNames || !excludeNames.has(l.name))
    );
    if (candidates.length === 0) return false;

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const tile = this.penguin.getTilePosition();

    for (const loc of shuffled) {
      if (reservation && !reservation.isAvailable(loc.x, loc.y, this.penguin.agentId)) continue;

      if (tile.x === loc.x && tile.y === loc.y) {
        claimTile(this.penguin, loc.x, loc.y, reservation);
        this.currentAnchor = loc.name;
        return true;
      }

      const path = pathfinder.findPath(tile.x, tile.y, loc.x, loc.y);
      if (path.length > 1) {
        claimTile(this.penguin, loc.x, loc.y, reservation);
        this.currentAnchor = loc.name;
        this.penguin.walkTo(path);
        return true;
      }
    }
    return false;
  }

  updateIdleBehavior(
    delta: number,
    pathfinder: Pathfinder,
    locations: Record<string, { x: number; y: number }>,
    typedLocations?: TypedLocation[],
    reservation?: TileReservation,
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
    const tile = this.penguin.getTilePosition();

    for (const target of locationNames) {
      const loc = locations[target];
      if (reservation && !reservation.isAvailable(loc.x, loc.y, this.penguin.agentId)) continue;
      const path = pathfinder.findPath(tile.x, tile.y, loc.x, loc.y);
      if (path.length > 1) {
        claimTile(this.penguin, loc.x, loc.y, reservation);
        this.penguin.walkTo(path);
        return;
      }
    }

    this.walkToRandomTile(pathfinder, reservation);
  }

  walkToRandomTile(pathfinder: Pathfinder, reservation?: TileReservation) {
    const tile = this.penguin.getTilePosition();
    const walkable = pathfinder.getWalkableTiles();
    if (walkable.length === 0) return;

    const attempts = Math.min(10, walkable.length);
    for (let i = 0; i < attempts; i++) {
      const idx = Math.floor(Math.random() * walkable.length);
      const target = walkable[idx];
      if (Math.abs(target.x - tile.x) + Math.abs(target.y - tile.y) < 2) continue;
      if (reservation && !reservation.isAvailable(target.x, target.y, this.penguin.agentId)) continue;
      const path = pathfinder.findPath(tile.x, tile.y, target.x, target.y);
      if (path.length > 1) {
        claimTile(this.penguin, target.x, target.y, reservation);
        this.penguin.walkTo(path);
        return;
      }
    }
  }
}

import { SpriteSheet } from './sprites/SpriteSheet';
import type { SpriteSheetConfig } from './sprites/SpriteSheet';
import { Penguin } from './penguins/Penguin';
import { PenguinLayer } from './penguins/PenguinLayers';
import { TileReservation } from './penguins/TileReservation';
import type { PenguinConfig, TypedLocation, AgentStatus } from '@penguverse/types';
import type { Scene } from './scene/Scene';
import { createStandardSpriteConfig } from './Penguverse';

export class PenguinManager {
  readonly penguins: Penguin[] = [];
  readonly penguinLayer = new PenguinLayer();
  readonly reservation = new TileReservation();

  private spawningAgents: Set<string> = new Set();
  private autoSpawnIndex = 0;

  constructor(
    private scene: Scene,
    private typedLocations: TypedLocation[],
    private config: { defaultSprites?: string[]; autoSpawn?: boolean; spriteSheets?: Record<string, SpriteSheetConfig>; worldBasePath?: string; world?: string },
  ) {}

  setTypedLocations(locations: TypedLocation[]) {
    this.typedLocations = locations;
  }

  getPenguin(agentId: string): Penguin | undefined {
    return this.penguins.find(p => p.agentId === agentId);
  }

  getOtherHomeAnchors(excludeAgentId: string): Set<string> {
    const homes = new Set<string>();
    for (const p of this.penguins) {
      if (p.agentId !== excludeAgentId) {
        homes.add(p.getHomePosition());
      }
    }
    return homes;
  }

  async addPenguin(config: PenguinConfig, sheetConfig?: SpriteSheetConfig): Promise<Penguin> {
    const sc = sheetConfig ?? this.config.spriteSheets?.[config.sprite] ?? createStandardSpriteConfig(config.sprite);
    const sheet = new SpriteSheet(sc);
    const basePath = this.config.worldBasePath ?? `worlds/${this.config.world}`;
    await sheet.load(basePath);

    const penguin = new Penguin(
      config,
      sheet,
      this.scene.config.tileWidth,
      this.scene.config.tileHeight,
    );

    const loc = this.scene.getLocation(config.position);
    if (loc) {
      penguin.setTilePosition(loc.x, loc.y);
    } else {
      const typed = this.typedLocations.find(l => l.name === config.position);
      if (typed) penguin.setTilePosition(typed.x, typed.y);
    }

    this.penguins.push(penguin);
    this.penguinLayer.setPenguins(this.penguins);
    this.unstickPenguins();
    return penguin;
  }

  removePenguin(agentId: string) {
    const idx = this.penguins.findIndex(p => p.agentId === agentId);
    if (idx < 0) return;
    this.reservation.release(agentId);
    this.penguins.splice(idx, 1);
    this.penguinLayer.setPenguins(this.penguins);
  }

  autoSpawnPenguin(agent: AgentStatus) {
    if (this.spawningAgents.has(agent.id)) return;

    const sprites = this.config.defaultSprites ?? ['penguin'];
    const sprite = sprites[this.autoSpawnIndex % sprites.length];
    this.autoSpawnIndex++;

    const wanderPoints = this.typedLocations.filter(l => l.type === 'wander');
    const shuffled = [...wanderPoints].sort(() => Math.random() - 0.5);
    let spawnLoc: TypedLocation | null = shuffled.find(l => this.reservation.isAvailable(l.x, l.y, agent.id))
      ?? shuffled[0] ?? null;

    if (!spawnLoc && this.typedLocations.length > 0) {
      const anyShuffled = [...this.typedLocations].sort(() => Math.random() - 0.5);
      spawnLoc = anyShuffled.find(l => this.reservation.isAvailable(l.x, l.y, agent.id)) ?? null;
    }

    let spawnPosition: string;
    if (spawnLoc) {
      spawnPosition = spawnLoc.name;
      this.reservation.reserve(spawnLoc.x, spawnLoc.y, agent.id);
    } else {
      const walkable = this.scene.pathfinder.getWalkableTiles();
      let tile: { x: number; y: number } | undefined;
      if (walkable.length > 0) {
        const step = Math.max(1, Math.floor(walkable.length / 8));
        const startIdx = (this.autoSpawnIndex * step) % walkable.length;
        for (let i = 0; i < walkable.length; i++) {
          const idx = (startIdx + i) % walkable.length;
          const candidate = walkable[idx];
          if (this.reservation.isAvailable(candidate.x, candidate.y, agent.id)) {
            tile = candidate;
            break;
          }
        }
        tile = tile ?? walkable[startIdx];
      }
      if (tile) {
        spawnPosition = `_spawn_${tile.x}_${tile.y}`;
        this.scene.config.locations[spawnPosition] = { x: tile.x, y: tile.y, label: spawnPosition };
        this.reservation.reserve(tile.x, tile.y, agent.id);
      } else {
        spawnPosition = 'center';
      }
    }

    this.spawningAgents.add(agent.id);
    this.addPenguin({ agentId: agent.id, name: agent.name, sprite, position: spawnPosition })
      .then((penguin) => {
        penguin.updateState(agent.state, agent.task, agent.energy);
      })
      .catch(() => { /* sprite load failed */ })
      .finally(() => { this.spawningAgents.delete(agent.id); });
  }

  unstickPenguins() {
    const grid = this.scene.config.walkable;
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;

    const destinations = this.typedLocations
      .filter(l => l.type === 'wander' || l.type === 'social' || l.type === 'utility')
      .map(l => ({ x: l.x, y: l.y }));

    const connectivity = (tx: number, ty: number) => {
      let count = 0;
      for (const [dx, dy] of dirs) {
        const nx = tx + dx, ny = ty + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[ny][nx]) count++;
      }
      return count;
    };

    for (const penguin of this.penguins) {
      const tile = penguin.getTilePosition();

      const canReachAny = destinations.some(d =>
        this.scene.pathfinder.findPath(tile.x, tile.y, d.x, d.y).length > 1
      );
      if (canReachAny) continue;

      const visited = new Set<string>();
      const queue: { x: number; y: number }[] = [{ x: tile.x, y: tile.y }];
      visited.add(`${tile.x},${tile.y}`);
      let found = false;

      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const [dx, dy] of dirs) {
          const nx = cur.x + dx, ny = cur.y + dy;
          const key = `${nx},${ny}`;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          if (visited.has(key)) continue;
          visited.add(key);

          if (grid[ny][nx] && connectivity(nx, ny) >= 2) {
            const reachable = destinations.some(d =>
              this.scene.pathfinder.findPath(nx, ny, d.x, d.y).length > 1
            );
            if (reachable) {
              penguin.setTilePosition(nx, ny);
              found = true;
              break;
            }
          }
          queue.push({ x: nx, y: ny });
        }
        if (found) break;
      }
    }
  }
}

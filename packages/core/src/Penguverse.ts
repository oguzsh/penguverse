import { Renderer } from './renderer/Renderer';
import { Scene } from './scene/Scene';
import type { SceneConfig, NamedLocation } from './scene/Scene';
import { SpriteSheet } from './sprites/SpriteSheet';
import type { SpriteSheetConfig } from './sprites/SpriteSheet';
import { Penguin, PenguinLayer } from './penguins/Penguin';
import { TileReservation } from './penguins/TileReservation';
import type { PenguinConfig, AgentState, TypedLocation, AnchorType } from './penguins/Penguin';
import { ParticleSystem } from './effects/Particles';
import { SpeechBubbleSystem } from './effects/SpeechBubble';
import { Signal } from './signal/Signal';
import type { SignalConfig, AgentStatus } from './signal/Signal';

export interface PenguverseConfig {
  container: HTMLElement;
  world: string;
  scene: string;
  signal: SignalConfig;
  penguins: PenguinConfig[];
  scale?: number;
  width?: number;
  height?: number;
  worldBasePath?: string;
  spriteSheets?: Record<string, SpriteSheetConfig>;
  sceneConfig?: SceneConfig;
  defaultSprites?: string[];
  autoSpawn?: boolean;
}

type PenguverseEvent = 'penguin:click';

export class Penguverse {
  private renderer: Renderer;
  private scene: Scene;
  private penguins: Penguin[] = [];
  private penguinLayer: PenguinLayer;
  private particles: ParticleSystem;
  private speechBubbles: SpeechBubbleSystem;
  private signal: Signal;
  private config: PenguverseConfig;
  private eventHandlers: Map<PenguverseEvent, Set<(data: unknown) => void>> = new Map();

  private particleTimers: Map<string, number> = new Map();
  private typedLocations: TypedLocation[] = [];
  private reservation = new TileReservation();
  private spawningAgents: Set<string> = new Set();
  private autoSpawnIndex = 0;

  constructor(config: PenguverseConfig) {
    this.config = config;
    const scale = config.scale ?? 2;
    const width = config.width ?? 512;
    const height = config.height ?? 384;

    this.renderer = new Renderer(config.container, width, height, scale);
    this.scene = new Scene(config.sceneConfig ?? createDefaultSceneConfig());
    this.penguinLayer = new PenguinLayer();
    this.particles = new ParticleSystem();
    this.speechBubbles = new SpeechBubbleSystem();
    this.signal = new Signal(config.signal);

    // Add render layers
    this.renderer.addLayer(this.scene);
    for (const layer of this.penguinLayer.getLayers()) {
      this.renderer.addLayer(layer);
    }
    this.renderer.addLayer(this.particles);
    this.renderer.addLayer(this.speechBubbles);

    // Tooltip layer: name tags above penguins
    this.renderer.addLayer({
      order: 30,
      render: (ctx) => {
        for (const p of this.penguins) {
          if (!p.visible) continue;
          ctx.save();
          ctx.font = '8px monospace';
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          const nameWidth = ctx.measureText(p.name).width;
          const tagX = p.x + (this.scene.config.tileWidth - nameWidth) / 2;
          const tagY = p.y - p.spriteSheet.config.frameHeight + this.scene.config.tileHeight - 4 - p.getSittingOffset();
          ctx.fillRect(tagX - 2, tagY - 8, nameWidth + 4, 12);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(p.name, tagX, tagY);
          ctx.restore();
        }
      },
    });

    // Signal handler
    this.signal.onUpdate((agents) => this.handleSignalUpdate(agents));

    // DM event handler: walk sender to recipient
    this.signal.onEvent((event) => {
      if (event.action?.type === 'message' && event.action?.to) {
        const sender = this.penguins.find(p => p.agentId === event.agentId);
        const recipient = this.penguins.find(p => p.agentId === event.action.to);
        if (sender && recipient && sender !== recipient) {
          const sPos = sender.getTilePosition();
          const rPos = recipient.getTilePosition();
          const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          let bestPath: { x: number; y: number }[] = [];
          for (const [dx, dy] of offsets) {
            const path = this.scene.pathfinder.findPath(sPos.x, sPos.y, rPos.x + dx, rPos.y + dy);
            if (path.length > 1 && (bestPath.length === 0 || path.length < bestPath.length)) {
              bestPath = path;
            }
          }
          if (bestPath.length > 1) {
            sender.walkTo(bestPath);
          }
        }
      }
    });

    // Click handler
    this.renderer.canvas.addEventListener('click', (e) => this.handleClick(e));

    // Update loop for penguins
    this.renderer.addLayer({
      order: -1,
      render: (_ctx, delta) => {
        const locations: Record<string, { x: number; y: number }> = {};
        for (const [key, loc] of Object.entries(this.scene.config.locations)) {
          locations[key] = { x: loc.x, y: loc.y };
        }
        for (const penguin of this.penguins) {
          const otherHomes = this.getOtherHomeAnchors(penguin.agentId);
          penguin.update(delta, this.scene.pathfinder, locations, this.typedLocations, this.reservation, otherHomes);
          penguin.applySeparation(this.penguins, delta);
          this.updatePenguinEffects(penguin, delta);
        }
      },
    });
  }

  async start(): Promise<void> {
    const basePath = this.config.worldBasePath ?? `worlds/${this.config.world}`;

    await this.scene.load(basePath);

    for (const penguinConfig of this.config.penguins) {
      const sheetConfig = this.config.spriteSheets?.[penguinConfig.sprite]
        ?? createStandardSpriteConfig(penguinConfig.sprite);
      const sheet = new SpriteSheet(sheetConfig);
      await sheet.load(basePath);

      const penguin = new Penguin(
        penguinConfig,
        sheet,
        this.scene.config.tileWidth,
        this.scene.config.tileHeight,
      );

      const loc = this.scene.getLocation(penguinConfig.position);
      if (loc) {
        penguin.setTilePosition(loc.x, loc.y);
      } else {
        const typed = this.typedLocations.find(l => l.name === penguinConfig.position);
        if (typed) penguin.setTilePosition(typed.x, typed.y);
      }

      this.penguins.push(penguin);
    }

    this.penguinLayer.setPenguins(this.penguins);
    this.unstickPenguins();
    this.signal.start();
    this.renderer.start();
  }

  private unstickPenguins() {
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

  stop() {
    this.renderer.stop();
    this.signal.stop();
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.canvas;
  }

  on(event: PenguverseEvent, handler: (data: unknown) => void) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: PenguverseEvent, handler: (data: unknown) => void) {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit(event: PenguverseEvent, data: unknown) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) handler(data);
    }
  }

  setTypedLocations(locations: TypedLocation[]) {
    this.typedLocations = locations;
  }

  getReservation(): TileReservation {
    return this.reservation;
  }

  getPenguin(agentId: string): Penguin | undefined {
    return this.penguins.find(p => p.agentId === agentId);
  }

  getPenguins(): Penguin[] {
    return [...this.penguins];
  }

  getBasePath(): string {
    return this.config.worldBasePath ?? `worlds/${this.config.world}`;
  }

  async addPenguin(config: PenguinConfig, sheetConfig?: SpriteSheetConfig): Promise<Penguin> {
    const sc = sheetConfig ?? createStandardSpriteConfig(config.sprite);
    const sheet = new SpriteSheet(sc);
    const basePath = this.getBasePath();
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

  private lastTransitionTime: Map<string, number> = new Map();
  private static readonly TRANSITION_DEBOUNCE_MS = 8000;

  private handleSignalUpdate(agents: AgentStatus[]) {
    for (const agent of agents) {
      const penguin = this.penguins.find(p => p.agentId === agent.id);
      if (!penguin) {
        if (this.config.autoSpawn !== false
          && agent.state !== 'offline'
          && !this.spawningAgents.has(agent.id)) {
          this.autoSpawnPenguin(agent);
        }
        continue;
      }

      if (penguin.isNpc) continue;

      const prevState = penguin.state;
      penguin.updateState(agent.state, agent.task, agent.energy);

      if (prevState !== agent.state) {
        const now = Date.now();
        const lastTransition = this.lastTransitionTime.get(penguin.agentId) ?? 0;
        const elapsed = now - lastTransition;

        const shouldTransition =
          elapsed >= Penguverse.TRANSITION_DEBOUNCE_MS
          || agent.state === 'working'
          || agent.state === 'offline'
          || prevState === 'offline'
          || !penguin.isMoving();

        if (shouldTransition) {
          this.handleStateTransition(penguin, prevState, agent.state);
          this.lastTransitionTime.set(penguin.agentId, now);
        }
      }
    }
  }

  private autoSpawnPenguin(agent: AgentStatus) {
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

  private getOtherHomeAnchors(excludeAgentId: string): Set<string> {
    const homes = new Set<string>();
    for (const p of this.penguins) {
      if (p.agentId !== excludeAgentId) {
        homes.add(p.getHomePosition());
      }
    }
    return homes;
  }

  private handleStateTransition(penguin: Penguin, from: AgentState, to: AgentState) {
    const otherHomes = this.getOtherHomeAnchors(penguin.agentId);

    if (this.typedLocations.length > 0) {
      if (to === 'working') {
        const home = penguin.getHomePosition();
        if (!penguin.goToAnchor(home, this.typedLocations, this.scene.pathfinder, this.reservation)) {
          penguin.goToAnchorType('work', this.typedLocations, this.scene.pathfinder, this.reservation, otherHomes);
        }
      } else if (to === 'sleeping') {
        penguin.goToAnchorType('rest', this.typedLocations, this.scene.pathfinder, this.reservation, otherHomes);
      } else if (to === 'speaking') {
        if (!penguin.isMoving()) {
          penguin.goToAnchorType('social', this.typedLocations, this.scene.pathfinder, this.reservation, otherHomes);
        }
      } else if (to === 'thinking') {
        penguin.goToAnchorType('utility', this.typedLocations, this.scene.pathfinder, this.reservation, otherHomes);
      }
    }

    if (to === 'working' && penguin.task) {
      this.speechBubbles.show(penguin.x + 16, penguin.y - 8, penguin.task, 4, penguin);
    } else if (to === 'error') {
      this.particles.emitExclamation(penguin.x + 16, penguin.y - penguin.getSittingOffset());
    } else if (to === 'speaking' && penguin.task) {
      this.speechBubbles.show(penguin.x + 16, penguin.y - 8, penguin.task, 5, penguin);
    }
  }

  private updatePenguinEffects(penguin: Penguin, delta: number) {
    const key = penguin.agentId;
    const timer = (this.particleTimers.get(key) ?? 0) + delta;
    this.particleTimers.set(key, timer);

    if (penguin.state === 'sleeping' && timer > 1.5) {
      this.particleTimers.set(key, 0);
      this.particles.emitZzz(penguin.x + 16, penguin.y);
    }

    if (penguin.state === 'thinking' && timer > 2) {
      this.particleTimers.set(key, 0);
      this.particles.emitThought(penguin.x + 16, penguin.y);
    }

    if (penguin.state === 'error' && timer > 2) {
      this.particleTimers.set(key, 0);
      this.particles.emitExclamation(penguin.x + 16, penguin.y);
    }
  }

  private handleClick(e: MouseEvent) {
    const world = this.renderer.screenToWorld(e.offsetX, e.offsetY);

    for (const penguin of this.penguins) {
      if (penguin.containsPoint(world.x, world.y)) {
        this.emit('penguin:click', {
          agentId: penguin.agentId,
          name: penguin.name,
          state: penguin.state,
          task: penguin.task,
          energy: penguin.energy,
        });
        return;
      }
    }
  }
}

function createDefaultSceneConfig(): SceneConfig {
  const cols = 16;
  const rows = 12;

  const floor: string[][] = [];
  const walkable: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    floor[r] = [];
    walkable[r] = [];
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        floor[r][c] = 'water';
        walkable[r][c] = false;
      } else {
        floor[r][c] = 'snow';
        walkable[r][c] = true;
      }
    }
  }

  return {
    name: 'main',
    tileWidth: 32,
    tileHeight: 32,
    layers: [floor],
    walkable,
    locations: {
      igloo_1: { x: 3, y: 3, label: 'Igloo 1' },
      igloo_2: { x: 7, y: 3, label: 'Igloo 2' },
      campfire: { x: 7, y: 7, label: 'Campfire' },
      rest_spot: { x: 12, y: 8, label: 'Rest Spot' },
      center: { x: 7, y: 6, label: 'Center' },
    },
    tiles: {
      snow: 'tiles/snow.png',
      ice: 'tiles/ice.png',
      water: 'tiles/water.png',
    },
  };
}

export function createStandardSpriteConfig(sprite: string): SpriteSheetConfig {
  return {
    sheets: {
      walk: `/assets/penguins/${sprite}_walk.png`,
      actions: `/assets/penguins/${sprite}_actions.png`,
    },
    animations: {
      idle_down: { sheet: 'actions', row: 3, frames: 4, speed: 0.5 },
      idle_up: { sheet: 'actions', row: 3, frames: 4, speed: 0.5 },
      walk_down: { sheet: 'walk', row: 0, frames: 4, speed: 0.15 },
      walk_up: { sheet: 'walk', row: 1, frames: 4, speed: 0.15 },
      walk_left: { sheet: 'walk', row: 2, frames: 4, speed: 0.15 },
      walk_right: { sheet: 'walk', row: 3, frames: 4, speed: 0.15 },
      working: { sheet: 'actions', row: 0, frames: 4, speed: 0.3 },
      sleeping: { sheet: 'actions', row: 1, frames: 2, speed: 0.8 },
      talking: { sheet: 'actions', row: 2, frames: 4, speed: 0.15 },
    },
    frameWidth: 64,
    frameHeight: 64,
  };
}

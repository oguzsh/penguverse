import { Renderer } from './renderer/Renderer';
import { Scene } from './scene/Scene';
import type { SceneConfig } from './scene/Scene';
import { SpriteSheet } from './sprites/SpriteSheet';
import type { SpriteSheetConfig } from './sprites/SpriteSheet';
import { Penguin } from './penguins/Penguin';
import type { PenguinConfig, TypedLocation, SignalConfig, AgentStatus } from '@penguverse/types';
import { ParticleSystem } from './effects/Particles';
import { SpeechBubbleSystem } from './effects/SpeechBubble';
import { Signal } from './signal/Signal';
import { PenguinManager } from './PenguinManager';
import { StateTransitionHandler } from './StateTransitionHandler';
import { EffectsController } from './EffectsController';
import { createTooltipLayer } from './TooltipLayer';

export interface PenguverseConfig {
  container: HTMLElement;
  world: string;
  scene: string;
  signal: SignalConfig;
  penguins: PenguinConfig[];
  scale?: number;
  renderScale?: number;
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
  private signal: Signal;
  private config: PenguverseConfig;
  private eventHandlers: Map<PenguverseEvent, Set<(data: unknown) => void>> = new Map();

  private penguinManager: PenguinManager;
  private stateHandler: StateTransitionHandler;
  private effects: EffectsController;
  private typedLocations: TypedLocation[] = [];
  private particles: ParticleSystem;
  private speechBubbles: SpeechBubbleSystem;

  constructor(config: PenguverseConfig) {
    this.config = config;
    const scale = config.scale ?? 1;
    const renderScale = config.renderScale ?? 1;
    const width = config.width ?? 512;
    const height = config.height ?? 384;

    this.renderer = new Renderer(config.container, width, height, scale, renderScale);
    this.scene = new Scene(config.sceneConfig ?? createDefaultSceneConfig());
    this.particles = new ParticleSystem();
    this.speechBubbles = new SpeechBubbleSystem();
    this.signal = new Signal(config.signal);

    this.penguinManager = new PenguinManager(this.scene, this.typedLocations, {
      defaultSprites: config.defaultSprites,
      autoSpawn: config.autoSpawn,
      spriteSheets: config.spriteSheets,
      worldBasePath: config.worldBasePath,
      world: config.world,
    });

    this.effects = new EffectsController(this.particles);

    this.stateHandler = new StateTransitionHandler({
      pathfinder: this.scene.pathfinder,
      reservation: this.penguinManager.reservation,
      particles: this.particles,
      speechBubbles: this.speechBubbles,
      getTypedLocations: () => this.typedLocations,
      getPenguins: () => this.penguinManager.penguins,
      getPenguin: (id) => this.penguinManager.getPenguin(id),
      getOtherHomeAnchors: (id) => this.penguinManager.getOtherHomeAnchors(id),
      autoSpawnPenguin: (agent) => this.penguinManager.autoSpawnPenguin(agent),
      autoSpawnEnabled: () => config.autoSpawn !== false,
    });

    // Add render layers
    this.renderer.addLayer(this.scene);
    for (const layer of this.penguinManager.penguinLayer.getLayers()) {
      this.renderer.addLayer(layer);
    }
    this.renderer.addLayer(this.particles);
    this.renderer.addLayer(this.speechBubbles);
    this.renderer.addLayer(createTooltipLayer(
      () => this.penguinManager.penguins,
      this.scene.config.tileWidth,
    ));

    // Signal handlers
    this.signal.onUpdate((agents) => this.stateHandler.handleSignalUpdate(agents));
    this.signal.onEvent((event) => this.stateHandler.handleDmEvent(event));

    // Click handler
    this.renderer.canvas.addEventListener('click', (e) => this.handleClick(e));

    // Update loop
    this.renderer.addLayer({
      order: -1,
      render: (_ctx, delta) => {
        const locations: Record<string, { x: number; y: number }> = {};
        for (const [key, loc] of Object.entries(this.scene.config.locations)) {
          locations[key] = { x: loc.x, y: loc.y };
        }
        for (const penguin of this.penguinManager.penguins) {
          const otherHomes = this.penguinManager.getOtherHomeAnchors(penguin.agentId);
          penguin.update(delta, this.scene.pathfinder, locations, this.typedLocations, this.penguinManager.reservation, otherHomes);
          penguin.applySeparation(this.penguinManager.penguins, delta);
          this.effects.updatePenguinEffects(penguin, delta);
        }
      },
    });
  }

  async start(): Promise<void> {
    const basePath = this.config.worldBasePath ?? `worlds/${this.config.world}`;

    if (this.config.sceneConfig?.tiles?.['background']) {
      const bgSrc = this.config.sceneConfig.tiles['background'];
      const isAbsolute = /^(\/|blob:|data:|https?:\/\/)/.test(bgSrc);
      const bgUrl = isAbsolute ? bgSrc : `${basePath}/${bgSrc}`;
      const bgImg = new Image();
      const canvasW = this.config.width ?? 512;
      const canvasH = this.config.height ?? 384;
      await new Promise<void>((resolve) => {
        bgImg.onload = () => {
          this.renderer.addLayer({
            order: -2,
            render: (ctx) => { ctx.drawImage(bgImg, 0, 0, canvasW, canvasH); },
          });
          resolve();
        };
        bgImg.onerror = () => resolve();
        bgImg.src = bgUrl;
      });
    }

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

      this.penguinManager.penguins.push(penguin);
    }

    this.penguinManager.penguinLayer.setPenguins(this.penguinManager.penguins);
    this.penguinManager.unstickPenguins();
    this.signal.start();
    this.renderer.start();
  }

  stop() {
    this.renderer.stop();
    this.signal.stop();
  }

  getCanvas(): HTMLCanvasElement { return this.renderer.canvas; }

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
    this.penguinManager.setTypedLocations(locations);
  }

  getReservation() { return this.penguinManager.reservation; }
  getPenguin(agentId: string) { return this.penguinManager.getPenguin(agentId); }
  getPenguins(): Penguin[] { return [...this.penguinManager.penguins]; }
  getBasePath(): string { return this.config.worldBasePath ?? `worlds/${this.config.world}`; }

  async addPenguin(config: PenguinConfig, sheetConfig?: SpriteSheetConfig): Promise<Penguin> {
    return this.penguinManager.addPenguin(config, sheetConfig);
  }

  removePenguin(agentId: string) {
    this.penguinManager.removePenguin(agentId);
  }

  private handleClick(e: MouseEvent) {
    const world = this.renderer.screenToWorld(e.offsetX, e.offsetY);
    for (const penguin of this.penguinManager.penguins) {
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

export function createStandardSpriteConfig(_sprite: string): SpriteSheetConfig {
  return {
    sheets: {
      main: '/assets/penguins/penguin-spritesheet.png',
    },
    animations: {
      walk_up:    { sheet: 'main', row: 1, frames: 4, speed: 0.12 },
      walk_down:  { sheet: 'main', row: 0, frames: 4, speed: 0.12 },
      walk_left:  { sheet: 'main', row: 3, frames: 4, speed: 0.12 },
      walk_right: { sheet: 'main', row: 2, frames: 4, speed: 0.12 },
      idle_down:  { sheet: 'main', row: 0, frames: 1, speed: 1, startFrame: 1 },
      idle_up:    { sheet: 'main', row: 1, frames: 1, speed: 1, startFrame: 1 },
      working:    { sheet: 'main', row: 0, frames: 2, speed: 0.4 },
      sleeping:   { sheet: 'main', row: 0, frames: 1, speed: 1 },
      talking:    { sheet: 'main', row: 0, frames: 4, speed: 0.15 },
    },
    frameWidth: 32,
    frameHeight: 48,
  };
}

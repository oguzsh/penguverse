import { Pathfinder } from './Pathfinder';
import type { RenderLayer } from '../renderer/RenderLayer';

export const DEADSPACE = '';

export interface NamedLocation {
  x: number;
  y: number;
  label: string;
}

export interface SceneConfig {
  name: string;
  tileWidth: number;
  tileHeight: number;
  layers: string[][][];
  walkable: boolean[][];
  locations: Record<string, NamedLocation>;
  tiles: Record<string, string>;
}

export class Scene implements RenderLayer {
  readonly order = 0;
  readonly config: SceneConfig;
  readonly pathfinder: Pathfinder;
  private tileImages: Map<string, HTMLImageElement> = new Map();
  private loaded = false;

  constructor(config: SceneConfig) {
    this.config = config;
    this.pathfinder = new Pathfinder(config.walkable);
  }

  async load(basePath: string): Promise<void> {
    const entries = Object.entries(this.config.tiles);
    const promises = entries.map(([key, src]) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.tileImages.set(key, img);
          resolve();
        };
        img.onerror = () => resolve();
        const isAbsolute = /^(\/|blob:|data:|https?:\/\/)/.test(src);
        img.src = isAbsolute ? src : `${basePath}/${src}`;
      });
    });

    await Promise.all(promises);
    this.loaded = true;
  }

  getLocation(name: string): NamedLocation | undefined {
    return this.config.locations[name];
  }

  getTileImages(): Map<string, HTMLImageElement> {
    return this.tileImages;
  }

  render(ctx: CanvasRenderingContext2D, _delta: number) {
    if (!this.loaded) return;

    const { tileWidth, tileHeight, layers } = this.config;

    for (const layer of layers) {
      for (let row = 0; row < layer.length; row++) {
        for (let col = 0; col < layer[row].length; col++) {
          const key = layer[row][col];
          if (key === DEADSPACE) {
            ctx.fillStyle = '#0a1628';
            ctx.fillRect(col * tileWidth, row * tileHeight, tileWidth, tileHeight);
            continue;
          }

          const img = this.tileImages.get(key);
          if (!img) continue;

          ctx.drawImage(
            img,
            0, 0, img.naturalWidth, img.naturalHeight,
            col * tileWidth, row * tileHeight, tileWidth, tileHeight,
          );
        }
      }
    }
  }
}

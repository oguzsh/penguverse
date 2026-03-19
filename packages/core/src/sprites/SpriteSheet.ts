export interface AnimationDef {
  sheet: string;
  row: number;
  frames: number;
  speed: number;
  /** Starting column offset within the row (default 0) */
  startFrame?: number;
}

export interface SpriteSheetConfig {
  sheets: Record<string, string>;
  animations: Record<string, AnimationDef>;
  frameWidth: number;
  frameHeight: number;
}

export class SpriteSheet {
  private images: Map<string, HTMLImageElement> = new Map();
  private loaded = false;
  readonly config: SpriteSheetConfig;

  constructor(config: SpriteSheetConfig) {
    this.config = config;
  }

  async load(basePath: string): Promise<void> {
    const promises = Object.entries(this.config.sheets).map(([key, filename]) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.images.set(key, img);
          resolve();
        };
        img.onerror = () => resolve();
        const isAbsolute = /^(\/|blob:|data:|https?:\/\/)/.test(filename);
        img.src = isAbsolute ? filename : `${basePath}/${filename}`;
      });
    });

    await Promise.all(promises);
    this.loaded = true;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  drawFrame(
    ctx: CanvasRenderingContext2D,
    animationName: string,
    frame: number,
    x: number,
    y: number,
  ) {
    const anim = this.config.animations[animationName];
    if (!anim) return;

    const img = this.images.get(anim.sheet);
    if (!img) return;

    const { frameWidth, frameHeight } = this.config;
    const sx = ((anim.startFrame ?? 0) + (frame % anim.frames)) * frameWidth;
    const sy = anim.row * frameHeight;

    ctx.drawImage(img, sx, sy, frameWidth, frameHeight, x, y, frameWidth, frameHeight);
  }
}

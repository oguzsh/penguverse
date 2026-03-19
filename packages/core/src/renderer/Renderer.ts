import { Camera } from './Camera';
import type { RenderLayer } from './RenderLayer';

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly camera: Camera;

  private layers: RenderLayer[] = [];
  private animationId: number | null = null;
  private lastTime = 0;
  private scale: number;
  private renderScale: number;
  /** World dimensions in logical units */
  private worldWidth: number;
  private worldHeight: number;

  constructor(container: HTMLElement, width: number, height: number, scale: number, renderScale = 1) {
    this.scale = scale;
    this.renderScale = renderScale;
    this.worldWidth = width;
    this.worldHeight = height;

    const canvasW = Math.round(width * renderScale);
    const canvasH = Math.round(height * renderScale);

    this.canvas = document.createElement('canvas');
    this.canvas.width = canvasW;
    this.canvas.height = canvasH;
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.width = `${canvasW * scale}px`;
    this.canvas.style.height = `${canvasH * scale}px`;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.camera = new Camera();
    container.appendChild(this.canvas);
  }

  addLayer(layer: RenderLayer) {
    this.layers.push(layer);
    this.layers.sort((a, b) => a.order - b.order);
  }

  removeLayer(layer: RenderLayer) {
    this.layers = this.layers.filter(l => l !== layer);
  }

  start() {
    this.lastTime = performance.now();
    const loop = (time: number) => {
      const delta = (time - this.lastTime) / 1000;
      this.lastTime = time;
      this.render(delta);
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private render(delta: number) {
    const { ctx, canvas, renderScale } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    this.camera.update();
    // Apply camera transform with renderScale baked in
    const z = this.camera.zoom * renderScale;
    ctx.setTransform(z, 0, 0, z, -this.camera.x * z, -this.camera.y * z);

    for (const layer of this.layers) {
      ctx.save();
      layer.render(ctx, delta);
      ctx.restore();
    }
  }

  resize(width: number, height: number) {
    this.worldWidth = width;
    this.worldHeight = height;
    const canvasW = Math.round(width * this.renderScale);
    const canvasH = Math.round(height * this.renderScale);
    this.canvas.width = canvasW;
    this.canvas.height = canvasH;
    this.canvas.style.width = `${canvasW * this.scale}px`;
    this.canvas.style.height = `${canvasH * this.scale}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  getScale(): number {
    return this.scale;
  }

  getRenderScale(): number {
    return this.renderScale;
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    // CSS display size → world coordinates
    const scaleX = rect.width / this.worldWidth;
    const scaleY = rect.height / this.worldHeight;
    const worldX = (screenX - rect.left) / scaleX;
    const worldY = (screenY - rect.top) / scaleY;
    return this.camera.screenToWorld(worldX, worldY);
  }
}

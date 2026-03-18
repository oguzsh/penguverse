export interface RenderLayer {
  order: number;
  render(ctx: CanvasRenderingContext2D, delta: number): void;
}

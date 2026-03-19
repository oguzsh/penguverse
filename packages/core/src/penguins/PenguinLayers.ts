import type { RenderLayer } from '../renderer/RenderLayer';
import type { Penguin } from './Penguin';

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

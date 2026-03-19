import type { RenderLayer } from './renderer/RenderLayer';
import type { Penguin } from './penguins/Penguin';

export function createTooltipLayer(
  getPenguins: () => Penguin[],
  tileWidth: number,
): RenderLayer {
  return {
    order: 22,
    render: (ctx) => {
      for (const p of getPenguins()) {
        if (!p.visible) continue;
        ctx.save();
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const nameWidth = ctx.measureText(p.name).width;
        const tagX = p.x + (tileWidth - nameWidth) / 2;
        const tagY = p.y - p.spriteSheet.config.frameHeight + tileWidth - 4 - p.getSittingOffset();
        ctx.fillRect(tagX - 2, tagY - 8, nameWidth + 4, 12);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.name, tagX, tagY);
        ctx.restore();
      }
    },
  };
}

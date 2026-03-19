export { Penguverse, createStandardSpriteConfig } from './Penguverse';
export type { PenguverseConfig } from './Penguverse';

export { Renderer } from './renderer/Renderer';
export type { RenderLayer } from './renderer/RenderLayer';
export { Camera } from './renderer/Camera';

export { SpriteSheet } from './sprites/SpriteSheet';
export { Animator } from './sprites/Animator';
export type { SpriteSheetConfig, AnimationDef } from './sprites/SpriteSheet';

export { Scene } from './scene/Scene';
export { Pathfinder } from './scene/Pathfinder';
export type { SceneConfig, NamedLocation } from './scene/Scene';

export { Penguin } from './penguins/Penguin';
export { PenguinLayer } from './penguins/PenguinLayers';

/** @internal */
export { DEADSPACE } from './scene/Scene';
/** @internal */
export { PenguinLayerBelow, PenguinLayerAbove } from './penguins/PenguinLayers';
/** @internal */
export { TileReservation } from './penguins/TileReservation';

export { ParticleSystem } from './effects/Particles';
export { SpeechBubbleSystem } from './effects/SpeechBubble';

export { Signal } from './signal/Signal';

// Re-export all types from @penguverse/types for backward compatibility
export type {
  AgentState,
  AnchorType,
  TypedLocation,
  PenguinConfig,
  WorldAction,
  AgentStatus,
  SignalConfig,
  SignalCallback,
  EventCallback,
  MessageCallback,
} from '@penguverse/types';

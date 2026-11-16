"use client";

import { GLASS } from "./glass";
import { ShaderStage } from "./shader-stage";

/** What lies over the stage and must stay legible: the copy, the head. */
export const HERO_CALM = [".site-hero-copy", ".site-head-in"] as const;

/**
 * The first stage's background: drops of liquid glass (glass.ts) over the stage's CSS light, the
 * pointer a drop of its own. A client module, so the shader's source ships in its script rather
 * than in the page's payload.
 */
export function HeroBackground() {
  return <ShaderStage fragment={GLASS} calm={HERO_CALM} />;
}

"use client";

import { NEBULA } from "./nebula";
import { ShaderStage } from "./shader-stage";

/** What lies over the stage and must stay legible: the copy, the head. */
export const HERO_CALM = [".site-hero-copy", ".site-head-in"] as const;

/**
 * The first stage's background: a nebula (nebula.ts) over the stage's CSS light; the pointer lights
 * and stirs its gas, the stars shift a little with it. A client module, so the shader's source ships
 * in its script rather than in the page's payload.
 */
export function HeroBackground() {
  return <ShaderStage fragment={NEBULA} calm={HERO_CALM} />;
}

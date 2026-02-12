import type { BlockView } from "./types/view";

const ACTIVATION_THRESHOLD = 500;

export interface VisibleRange {
  startIndex: number;
  endIndex: number;
  overscan: number;
}

/**
 * Compute visible block range for documents >500 blocks.
 * Uses scroll position for windowed rendering.
 */
export function computeVisibleRange(
  blocks: BlockView[],
  scrollTop: number,
  containerHeight: number,
  estimatedBlockHeight: number,
): VisibleRange | null {
  if (blocks.length < ACTIVATION_THRESHOLD) return null;

  const overscan = 10;
  const startIndex = Math.max(0, Math.floor(scrollTop / estimatedBlockHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / estimatedBlockHeight) + overscan * 2;
  const endIndex = Math.min(blocks.length - 1, startIndex + visibleCount);

  return { startIndex, endIndex, overscan };
}

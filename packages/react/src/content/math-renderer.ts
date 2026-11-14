import type { TexResult } from "@gotipe/core/math";
import { createContext, useContext } from "react";

/** A TeX reader, such as `parseTex` of `@gotipe/core/math`. */
export type MathRenderer = (tex: string, options?: { display?: boolean }) => TexResult;

/**
 * Draws formulas when given a TeX reader: `<MathRendererContext.Provider value={parseTex}>`.
 * Without one, inline formulas and math blocks show their TeX, and `@gotipe/core/math` is
 * not loaded. `BlockEditor` and `PageEditor` provide it.
 */
export const MathRendererContext = createContext<MathRenderer | null>(null);

export const useMathRenderer = (): MathRenderer | null => useContext(MathRendererContext);

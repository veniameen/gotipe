// Optional entry `@gotipe/core/math`: GoTipe's own TeX → MathML converter stays out of the
// core bundle and loads only when a host imports it. Framework-free; renderers build DOM or
// server HTML from the validated tree.
export { parseTex, TEX_MAX_DEPTH, TEX_MAX_LENGTH } from "./math/parser";
export { isMathElement, mathToDOM, mathToString } from "./math/render";
export { MATH_ATTRS, MATH_NAMESPACE, MATH_TAGS } from "./math/types";
export type {
  MathAttr,
  MathElement,
  MathNode,
  MathTag,
  TexError,
  TexErrorCode,
  TexResult,
} from "./math/types";

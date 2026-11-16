/**
 * The light of the first stage as a WebGL program: a field of flowing noise (domain warping) in the
 * accent's blues, fine contour lines running along it, the light gathering where the pointer is.
 * The output is premultiplied light over the stage's own CSS ground, so the page reads the same
 * without it. Pure data: the sources and the colour parser, no DOM.
 */

export const LIGHT_VERTEX = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/** Put before the fragment source when the GPU has OES_standard_derivatives. */
export const DERIVATIVES =
  "#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES 1\n";

export const LIGHT_FRAGMENT = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_presence;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_strength;
uniform float u_lines;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = turn * p * 2.03 + 11.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 1.6;
  vec2 m = vec2(u_pointer.x * aspect, u_pointer.y) * 1.6;
  float t = u_time * 0.05;

  // the pointer pulls the flow toward itself and gathers its light
  vec2 d = p - m;
  float well = exp(-dot(d, d) * 3.2) * u_presence;
  p -= d * well * 0.45;

  // the flow: noise warped by noise
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, -t * 0.8)));
  vec2 r = vec2(
    fbm(p + 2.4 * q + vec2(1.7, 9.2) + t * 0.6),
    fbm(p + 2.4 * q + vec2(8.3, 2.8) - t * 0.5)
  );
  float f = fbm(p * 0.9 + 2.2 * r);

  // light from above, strongest over the middle of the stage
  float top = smoothstep(-0.1, 1.0, uv.y);
  float middle = 1.0 - smoothstep(0.15, 0.75, abs(uv.x - 0.5));
  float sky = top * top * (0.45 + 0.55 * middle);

  vec3 colour = mix(u_c1, u_c2, clamp(length(r) - 0.35, 0.0, 1.0));
  colour = mix(colour, u_c3, smoothstep(0.62, 0.92, f) * 0.55 + well * 0.35);

  // contour lines of the field: a pixel wide where the GPU gives derivatives, flowing, brighter
  // where the pointer is
  float k = f * 10.0;
  float dk = abs(fract(k + 0.5) - 0.5);
#ifdef HAS_DERIVATIVES
  float line = 1.0 - smoothstep(0.0, fwidth(k) * 1.25, dk);
#else
  float line = 1.0 - smoothstep(0.0, 0.05, dk);
#endif
  line *= u_lines * (0.35 + 0.65 * top) * (0.45 + 1.8 * well);

  // a calm lane behind the copy: the light stays at the sides of the headline
  float lane = (1.0 - smoothstep(0.1, 0.32, abs(uv.x - 0.5))) * smoothstep(0.42, 0.6, uv.y);
  line *= 1.0 - 0.75 * lane * (1.0 - well);
  float body = smoothstep(0.32, 0.88, f) * sky * (1.0 - 0.35 * lane);
  float alpha = clamp((body + line + well * 0.24) * u_strength, 0.0, 1.0);
  gl_FragColor = vec4(colour * alpha, alpha);
}
`;

/** The colour of a token as the shader takes it: `#rrggbb` or `#rgb` → three channels in 0..1. */
export function hexColour(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

/** Moves `from` toward `to` by the share of the way a spring covers in `dt` seconds. */
export function approach(from: number, to: number, dt: number, rate: number): number {
  return to + (from - to) * Math.exp(-rate * dt);
}

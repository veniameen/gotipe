/**
 * The first stage's background, a fragment shader for ShaderStage (shader-stage.tsx): a nebula,
 * soft, abstract and slow, so it stays behind the copy. It takes the theme's colours: deep, main,
 * second and light for the gas, ink for the stars.
 */

const COSMOS = `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v / 0.875;
}
vec2 turn(vec2 v, float a) {
  float s = sin(a);
  float c = cos(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}
/* a layer of stars: in a share of the cells (cell px) a star, set off its cell's middle, softly
   round, twinkling slowly */
float starLayer(vec2 frag, float cell, float share) {
  vec2 id = floor(frag / cell);
  vec2 h = hash2(id);
  if (h.x > share) return 0.0;
  vec2 centre = (id + 0.2 + 0.6 * hash2(id + 17.0)) * cell;
  float size = 0.6 + 1.1 * h.y * h.y;
  vec2 d = frag - centre;
  float twinkle = 0.6 + 0.4 * sin(u_time * (0.4 + 1.2 * h.y) + 40.0 * h.x);
  return exp(-dot(d, d) / (size * size)) * twinkle * (0.3 + 0.7 * h.y);
}
/* two layers of stars, the nearer shifting more with the pointer */
float starField(vec2 frag) {
  vec2 depth = (u_pointer - 0.5) * u_res * u_presence;
  return starLayer(frag + depth * 0.006, 31.0, 0.14) + 1.2 * starLayer(frag + depth * 0.016, 79.0, 0.2);
}
/* one colour over another, both premultiplied */
vec4 over(vec4 top, vec4 bottom) {
  return top + bottom * (1.0 - top.a);
}
`;

/**
 * Gas of the theme's blues along the stage's sides, framing the copy: noise bent by noise,
 * large and soft, drifting very slowly; stars over it. The pointer lights the gas about it and stirs
 * it, more as it moves.
 */
export const NEBULA = `${COSMOS}
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = screenAt(frag);
  if (p.y < -1.2) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 m = screenAt(u_pointer * u_res);
  float t = u_time * 0.02;
  float calm = calmAt(frag);

  vec2 flow = u_flow * u_res / u_fold;
  vec2 d = p - m;
  float near = exp(-dot(d, d) * 6.0) * u_presence;
  vec2 q = m + turn(d, near * (0.5 + 1.2 * min(length(flow), 2.0))) - flow * near * 0.04;

  vec2 w = vec2(fbm(q * 0.6 + vec2(t, 0.3)), fbm(q * 0.6 + vec2(4.7, -t)));
  vec2 v = vec2(
    fbm(q * 0.6 + 2.0 * w + vec2(1.7, 9.2) + t),
    fbm(q * 0.6 + 2.0 * w + vec2(8.3, 2.8) - t)
  );
  float gas = fbm(q * 0.6 + 2.2 * v);
  // where the gas lies: along the stage's sides, framing the copy, thinning toward the top
  float wide = u_res.x / u_fold;
  float sides = smoothstep(0.15, 0.7, abs(q.x) / (0.5 * wide) + 0.25 * (w.y - 0.5));
  float band = sides * exp(-pow((q.y + 0.05) / 0.62, 2.0));
  float density = smoothstep(0.28, 0.72, gas) * band;
  float glow = band * 0.3;

  vec3 colour = mix(u_deep, u_main, smoothstep(0.3, 0.7, gas));
  colour = mix(colour, u_second, smoothstep(0.5, 1.0, length(v)) * 0.6);
  colour = mix(colour, u_light, smoothstep(0.66, 0.95, gas) * 0.35 + near * 0.3);
  float fade = smoothstep(-1.15, -0.4, p.y);
  float alpha = (max(density, glow) * mix(0.62, 0.7, u_dark) + near * 0.12) * (1.0 - 0.85 * calm);
  alpha *= fade;

  float stars = starField(frag) * (0.6 + 0.6 * band) * (1.0 - 0.9 * calm) * fade;
  float starAlpha = clamp(stars * mix(0.55, 0.9, u_dark), 0.0, 1.0);
  gl_FragColor = over(vec4(u_ink * starAlpha, starAlpha), vec4(colour * alpha, alpha));
}
`;

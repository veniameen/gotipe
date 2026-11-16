/**
 * The first stage's background, a fragment shader for ShaderStage (shader-stage.tsx): drops of
 * liquid glass that drift, meet and part. Their rounded rims bend the bands of the theme's blues
 * behind them, catch a highlight from the top left and a rim of light. The pointer is a drop of its
 * own, drawn out along its motion, that the others flow into. The drops keep to the sides and
 * below the head, thin out under the copy, and fade below the first screen into the stage's CSS
 * light.
 */
export const GLASS = `
vec3 behind(vec2 q, float t) {
  float band = q.y + 0.22 * sin(q.x * 2.6 + t) + 0.1 * sin(q.x * 6.1 - t * 1.3);
  vec3 c = mix(u_deep, u_main, smoothstep(-0.5, 0.1, band));
  c = mix(c, u_second, smoothstep(0.0, 0.35, band) * 0.8);
  return mix(c, u_light, smoothstep(0.3, 0.6, band));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = screenAt(frag);
  if (p.y < -1.2) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 m = screenAt(u_pointer * u_res);
  float wide = u_res.x / u_fold;
  float t = u_time * 0.2;
  float calm = calmAt(frag);
  float px = 1.0 / u_fold;

  // the drops' field, each r^2 / d^2, and its slope
  float f = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    float k = float(i);
    float side = mod(k, 2.0) * 2.0 - 1.0;
    vec2 c = vec2(
      side * (0.3 + 0.17 * sin(t * (0.5 + 0.09 * k) + k * 1.7)) * wide,
      0.3 * sin(t * (0.37 + 0.07 * k) + k * 2.3)
    );
    float r = 0.065 + 0.05 * fract(k * 0.618 + 0.3);
    vec2 d = p - c;
    float d2 = dot(d, d) + 1e-5;
    float v = r * r / d2;
    f += v;
    g -= 2.0 * v * d / d2;
  }
  // the pointer's drop, drawn out along its motion
  vec2 flow = u_flow * u_res / u_fold;
  float speed = length(flow);
  vec2 along = speed > 0.001 ? flow / speed : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  float stretch = 1.0 + 0.5 * min(speed, 1.6);
  vec2 d = p - m;
  float a = dot(d, along) / stretch;
  float b = dot(d, across);
  float d2 = a * a + b * b + 1e-5;
  float v = u_presence * 0.0049 / d2;
  f += v;
  g -= 2.0 * v * (a / stretch * along + b * across) / d2;

  // the distance to the rim, of f^-1/2 - 1 (exact for a lone drop); a rounded rim, a flat top
  float slopeLength = length(g) + 1e-4;
  float edge = 2.0 * f * (1.0 - sqrt(f)) / slopeLength;
  float inside = 1.0 - smoothstep(-px, px, edge);
  float lift = 1.0 - clamp(-edge / 0.05, 0.0, 1.0);
  float slope = lift / sqrt(max(1.0 - lift * lift, 0.012));
  vec3 n = normalize(vec3(g / slopeLength * slope, 1.0));

  // bent bands behind, a highlight from the top left, a rim of light, a shade on the near rim
  vec3 light = normalize(vec3(-0.5, 0.6, 0.62));
  float spec = pow(max(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);
  float fresnel = pow(1.0 - n.z, 2.0);
  vec3 glass = behind(p - n.xy * 0.16, t);
  glass = mix(glass, u_light, fresnel * 0.55) + spec * 0.85 * (1.0 - calm);
  glass *= 1.0 - 0.22 * max(dot(n.xy, light.xy), 0.0) * lift;

  // a glow about each drop; a trace under the copy and the head (its text keeps 4.5:1), gone below
  // the first screen
  float glow = exp(-max(edge, 0.0) / 0.04) * (1.0 - inside) * mix(0.16, 0.26, u_dark);
  float alpha = max(inside * mix(0.72, 0.95, fresnel), glow);
  vec3 colour = mix(u_main, glass, inside);
  alpha *= (1.0 - 0.9 * calm) * smoothstep(-1.15, -0.4, p.y);
  gl_FragColor = vec4(colour * alpha, alpha);
}
`;
